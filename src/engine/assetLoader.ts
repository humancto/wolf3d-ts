/**
 * Wolf3D-TS Asset Loader
 *
 * Loads PNG textures at runtime and converts them to the ABGR Uint32Array
 * format used by the software renderer.
 */

// Detect base URL for asset paths (works with Vite's base config)
const BASE = (() => {
  try {
    // Vite injects import.meta.env.BASE_URL at build time
    return (import.meta as any).env?.BASE_URL ?? "/";
  } catch {
    return "/";
  }
})();

/**
 * Load a single PNG image and return its pixels as an ABGR Uint32Array.
 * The renderer stores pixels as 0xAABBGGRR (little-endian ABGR).
 */
export async function loadImageAsABGR(
  url: string,
  width = 64,
  height = 64,
): Promise<Uint32Array | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load: ${url}`));
      img.src = url;
    });

    // Draw to an offscreen canvas to extract pixel data
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const rgba = imageData.data; // Uint8ClampedArray in RGBA order

    // Convert RGBA → ABGR packed Uint32Array
    const abgr = new Uint32Array(width * height);
    for (let i = 0; i < abgr.length; i++) {
      const j = i * 4;
      const r = rgba[j];
      const g = rgba[j + 1];
      const b = rgba[j + 2];
      const a = rgba[j + 3];
      abgr[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }

    return abgr;
  } catch {
    return null;
  }
}

/**
 * Asset manifest: all the textures we need to load.
 */
export interface AssetManifest {
  walls: (Uint32Array | null)[]; // 8 wall textures
  doors: (Uint32Array | null)[]; // 2 door textures
  enemies: {
    guard: (Uint32Array | null)[];
    officer: (Uint32Array | null)[];
    ss: (Uint32Array | null)[];
    mutant: (Uint32Array | null)[];
  };
  weapons: {
    knife: (Uint32Array | null)[];
    pistol: (Uint32Array | null)[];
    machinegun: (Uint32Array | null)[];
    chaingun: (Uint32Array | null)[];
  };
}

/**
 * Load all game assets with progress callback.
 * Returns null for any individual asset that fails (graceful degradation).
 */
export async function loadAllAssets(
  onProgress?: (loaded: number, total: number) => void,
): Promise<AssetManifest> {
  const manifest: AssetManifest = {
    walls: [],
    doors: [],
    enemies: { guard: [], officer: [], ss: [], mutant: [] },
    weapons: { knife: [], pistol: [], machinegun: [], chaingun: [] },
  };

  // Build list of all URLs to load
  interface LoadTask {
    url: string;
    target: "wall" | "door" | "enemy" | "weapon";
    index: number;
    category?: string;
  }

  const tasks: LoadTask[] = [];

  // Walls (0-7)
  for (let i = 0; i < 8; i++) {
    tasks.push({
      url: `${BASE}assets/walls/wall_${i}.png`,
      target: "wall",
      index: i,
    });
  }

  // Doors (0-1)
  for (let i = 0; i < 2; i++) {
    tasks.push({
      url: `${BASE}assets/walls/door_${i}.png`,
      target: "door",
      index: i,
    });
  }

  // Enemy frames
  const enemyDefs = [
    { name: "guard", frames: "abcdefghijklmn" },
    { name: "officer", frames: "abcdefghijklmno" },
    { name: "ss", frames: "abcdefghijklmn" },
    { name: "mutant", frames: "abcdefghijklmnop" },
  ];

  for (const def of enemyDefs) {
    for (let i = 0; i < def.frames.length; i++) {
      tasks.push({
        url: `${BASE}assets/enemies/${def.name}/${def.frames[i]}.png`,
        target: "enemy",
        index: i,
        category: def.name,
      });
    }
  }

  // Weapon frames
  const weaponNames = ["knife", "pistol", "machinegun", "chaingun"];
  for (const name of weaponNames) {
    for (let i = 0; i < 5; i++) {
      tasks.push({
        url: `${BASE}assets/weapons/${name}_${i}.png`,
        target: "weapon",
        index: i,
        category: name,
      });
    }
  }

  // Load all in parallel with progress tracking
  const total = tasks.length;
  let loaded = 0;

  const results = await Promise.all(
    tasks.map(async (task) => {
      const pixels = await loadImageAsABGR(task.url);
      loaded++;
      onProgress?.(loaded, total);
      return { task, pixels };
    }),
  );

  // Distribute results into manifest
  for (const { task, pixels } of results) {
    switch (task.target) {
      case "wall":
        manifest.walls[task.index] = pixels;
        break;
      case "door":
        manifest.doors[task.index] = pixels;
        break;
      case "enemy": {
        const cat = task.category as keyof typeof manifest.enemies;
        manifest.enemies[cat][task.index] = pixels;
        break;
      }
      case "weapon": {
        const cat = task.category as keyof typeof manifest.weapons;
        manifest.weapons[cat][task.index] = pixels;
        break;
      }
    }
  }

  return manifest;
}
