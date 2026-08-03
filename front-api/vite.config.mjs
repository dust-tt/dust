import path from "path";
import { defineConfig } from "vitest/config";

// Tests in front-api/ reuse front's vitest setup (DB transaction isolation,
// Redis mocks, file storage mocks, etc.) so they work the same way as Next
// tests. The @app alias still points at front/ because most factories and
// resources live there.
export default defineConfig({
  test: {
    globals: true,
    root: new URL(".", import.meta.url).pathname,
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
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
    // In CI: emit a JUnit report with file= on every <testcase> so the
    // annotation action resolves the right source file. Without file=, the
    // action guesses from the classname, which ends in ".ts" and matches
    // node_modules/thread-stream/test/ts.test.ts instead of the actual file.
    ...(process.env.CI
      ? { reporters: [["junit", { addFileAttribute: true }]] }
      : {}),
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "../front"),
      "@front-api": path.resolve(__dirname, "."),
    },
  },
});
