import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    testTimeout: (function getTestTimeout() {
      const isDebug =
        process.env.VITEST_DEBUG === "1" ||
        process.execArgv?.some((a) => a.includes("--inspect")) === true;
      return isDebug ? Infinity : 5_000;
    })(),
    globals: true,
    setupFiles: "./vite.setup.ts",
    globalSetup: "./vite.globalSetup.ts",

    // We use forks by default to isolate tests in separate processes that can rely on CLS for
    // transactions isolation. However, when a debugger is attached (Node --inspect), we switch to
    // a single-threaded pool so breakpoints hit reliably. Vitest runs workers in separate
    // processes/threads and the Node inspector only attaches to the main process by default.
    // Detect an attached debugger by checking execArgv and a dedicated env var for flexibility.
    ...(function resolvePoolForDebug() {
      const isDebug =
        process.env.VITEST_DEBUG === "1" ||
        process.execArgv?.some((a) => a.includes("--inspect")) === true;

      if (isDebug) {
        return {
          pool: "threads",
          poolOptions: {
            threads: {
              singleThread: true, // Run everything in a single worker to allow debugger attach.
            },
          },
        };
      }
      return {
        pool: "forks",
        poolOptions: {
          forks: {
            singleFork: false, // Use multiple forks for parallelism
            isolate: true, // Each test file gets its own process
          },
        },
      };
    })(),
  },
  resolve: {
    alias: {
      "@connectors": path.resolve(__dirname, "./src"),
    },
  },
});
