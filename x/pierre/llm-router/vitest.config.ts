import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

import path from "node:path";

export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    environment: "node",
    env: loadEnv(mode, process.cwd(), ""),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
