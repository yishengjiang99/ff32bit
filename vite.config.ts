import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "dev-source-index",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const path = req.url?.split("?")[0];
          if (path === "/" || path === "/index.html") {
            const query = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
            req.url = "/index.src.html" + query;
          }
          next();
        });
      },
    },
  ],
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.src.html"),
        ffplayer: resolve(__dirname, "src/ffplayer.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "ffplayer" ? "ffplayer.js" : "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
