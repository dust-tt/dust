import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] } }),
    lingui(),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vite.i18nSetup.ts", "./vite.setup.ts"],
    globalSetup: "./vite.globalSetup.ts",
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
    maxConcurrency: 20,

    testTimeout: (function getTestTimeout() {
      const isDebug =
        process.env.VITEST_DEBUG === "1" ||
        process.execArgv?.some((a) => a.includes("--inspect")) === true;
      return isDebug ? Infinity : 5_000;
    })(),
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
          maxWorkers: 1, // Run everything in a single worker to allow debugger attach.
          isolate: false,
        };
      }
      return {
        pool: "forks",
        isolate: true, // Each test file gets its own process
        maxWorkers: 5,
        minWorkers: 1,
      };
    })(),
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./"),
    },
    // Sparkle renders Lingui too: one `@lingui/react` keeps a single context.
    dedupe: ["@lingui/react"],
  },
});
