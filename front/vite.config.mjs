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

    // We uses forks instead of threads to isolate tests in separate processes that can rely on CLS for transactions isolation.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false, // Use multiple forks for parallelism
        isolate: true, // Each test file gets its own proces
      },
    },
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./"),
    },
  },
});
