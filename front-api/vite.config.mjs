import path from "path";
import { defineConfig } from "vitest/config";

// Tests in front-api/ reuse front's vitest setup (DB transaction isolation,
// Redis mocks, file storage mocks, etc.) so they work the same way as Next
// tests. The @app alias still points at front/ because most factories and
// resources live there.
export default defineConfig({
  test: {
    globals: true,
    // jsdom mirrors front's vitest config; some test factories rely on
    // jsdom-provided globals (e.g. globalThis.name).
    environment: "jsdom",
    setupFiles: "./vite.setup.ts",
    globalSetup: "../front/vite.globalSetup.ts",
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
    pool: "forks",
    isolate: true,
    maxWorkers: 5,
    minWorkers: 1,
    testTimeout: 5_000,
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "../front"),
      "@front-api": path.resolve(__dirname, "."),
    },
  },
});
