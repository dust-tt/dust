import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@viz": path.resolve(__dirname, "."),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.tsx"],
        },
      },
      {
        extends: true,
        optimizeDeps: { include: ["react/jsx-dev-runtime"] },
        test: {
          name: "browser",
          include: ["**/*.browser.test.tsx"],
          testTimeout: 15_000,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
