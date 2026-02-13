"""
Convert Wolf3D palette-indexed BMP files to PNG.
Usage: python3 scripts/convert-bmp.py
"""

import os
import sys
from PIL import Image

SRC = "/tmp/wolf3d-assets"
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets")

# Wall textures: 8 selected + 2 doors
WALL_MAP = {
    "greybrick1.bmp": "wall_0.png",
    "bluestone1.BMP": "wall_1.png",
    "wood1.BMP": "wall_2.png",
    "stone1.BMP": "wall_3.png",
    "bluestone3.BMP": "wall_4.png",
    "wood3.BMP": "wall_5.png",
    "greybrick5.bmp": "wall_6.png",
    "brick1.BMP": "wall_7.png",
    "door1.BMP": "door_0.png",
    "elevator1.BMP": "door_1.png",
}

# Enemy definitions: prefix, output dir, frame letters
ENEMIES = [
    ("GARD", "guard", list("ABCDEFGHIJKLMN")),
    ("OFFI", "officer", list("ABCDEFGHIJKLMNO")),
    ("NZSS", "ss", list("ABCDEFGHIJKLMN")),
    ("MTNT", "mutant", list("ABCDEFGHIJKLMNOP")),
]


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def convert_wall(src_file, dst_file):
    src_path = os.path.join(SRC, "w3d_textures_fix", src_file)
    dst_path = os.path.join(DST, "walls", dst_file)
    if not os.path.exists(src_path):
        print(f"  SKIP (not found): {src_path}")
        return False
    img = Image.open(src_path).convert("RGBA")
    img.save(dst_path, "PNG")
    print(f"  OK {src_file} -> {dst_file}")
    return True


def convert_enemy(src_path, dst_path):
    if not os.path.exists(src_path):
        print(f"  SKIP (not found): {src_path}")
        return False
    img = Image.open(src_path).convert("RGBA")
    pixels = img.load()
    # Use top-left pixel as background key color
    bg = pixels[0, 0]
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if (r, g, b) == (bg[0], bg[1], bg[2]):
                pixels[x, y] = (r, g, b, 0)
    img.save(dst_path, "PNG")
    return True


def main():
    print("=== Wolf3D BMP -> PNG Converter ===\n")

    # Walls
    print("Converting wall textures...")
    ensure_dir(os.path.join(DST, "walls"))
    wall_count = 0
    for src_file, dst_file in WALL_MAP.items():
        if convert_wall(src_file, dst_file):
            wall_count += 1
    print(f"  {wall_count} wall textures converted.\n")

    # Enemies
    print("Converting enemy sprites...")
    enemy_count = 0
    for prefix, dirname, frames in ENEMIES:
        out_dir = os.path.join(DST, "enemies", dirname)
        ensure_dir(out_dir)
        for frame in frames:
            # Walking frames (A-E) have 8 rotations, use rotation 1
            # Action frames (F+) have rotation 0
            is_walking = frame <= "E"
            rotation = "1" if is_walking else "0"
            src_file = f"{prefix}{frame}{rotation}.bmp"
            dst_file = f"{frame.lower()}.png"
            src_path = os.path.join(SRC, "w3d_enemies_fix", src_file)
            dst_path = os.path.join(out_dir, dst_file)
            if convert_enemy(src_path, dst_path):
                enemy_count += 1
        print(f"  OK {prefix}: {len(frames)} frames -> {dirname}/")
    print(f"  {enemy_count} enemy sprites converted.\n")

    print(f"=== Done: {wall_count} walls, {enemy_count} enemies ===")


if __name__ == "__main__":
    main()
