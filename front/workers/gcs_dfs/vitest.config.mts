import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@app": fileURLToPath(new URL("../../", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["workers/gcs_dfs/*.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
