import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "electron/main.ts"),
          "search-worker": path.resolve(__dirname, "electron/workers/search-worker.ts"),
        },
        external: ["node-pty"],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist-electron",
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, "electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: ".",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: path.resolve(__dirname, "index.html"),
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-xterm": ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-search", "@xterm/addon-webgl"],
            "vendor-ui": ["react-grid-layout", "lucide-react"],
            "vendor-highlight": ["highlight.js/lib/core"],
            "vendor-markdown": ["marked"],
          },
        },
      },
    },
    plugins: [
      react(),
      ...(process.env.ANALYZE
        ? [visualizer({ open: true, filename: "bundle-stats.html", gzipSize: true })]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  },
});
