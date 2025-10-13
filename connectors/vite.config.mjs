import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    setupFiles: "./vite.setup.ts",
    globalSetup: "./vite.globalSetup.ts",

    // We uses forks instead of threads to isolate tests in separate processes that can rely on CLS for transactions isolation.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false, // Use multiple forks for parallelism
        isolate: true, // Each test file gets its own process
      },
    },
  },
  resolve: {
    alias: {
      "@connectors": path.resolve(__dirname, "./src"),
    },
  },
});
