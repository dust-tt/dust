import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
    maxConcurrency: 10,
    testTimeout: 30000,
    pool: "forks",
    isolate: true,
    maxWorkers: 10,
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./"),
    },
  },
});
