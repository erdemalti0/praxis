import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist-electron",
      rollupOptions: {
        input: path.resolve(__dirname, "electron/main.ts"),
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
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  },
});
