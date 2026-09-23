import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@sparkle": path.join(root, "src") } },
  test: {
    name: "unit",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
