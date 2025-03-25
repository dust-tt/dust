import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    setupFiles: "./vite.setup.ts",
    globalSetup: "./vite.globalSetup.ts",
  },
  resolve: {
    alias: {
      "@connectors": path.resolve(__dirname, "./src"),
    },
  },
});
