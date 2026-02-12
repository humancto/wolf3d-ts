import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/wolf3d-ts/",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 3001,
    open: true,
  },
});
