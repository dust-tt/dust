import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
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
      "@app": path.resolve(__dirname, "./"), // adjust the path according to your project structure
    },
  },
});
