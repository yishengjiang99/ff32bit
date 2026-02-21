import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        ffplayer: resolve(__dirname, "src/ffplayer.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "ffplayer" ? "ffplayer.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
