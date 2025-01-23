import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vite.setup.ts",
    globalSetup: "./vite.globalSetup.ts",
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./"),
    },
  },
});
