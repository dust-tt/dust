import path from "node:path";
import { fileURLToPath } from "node:url";
import { linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [babel({ presets: [linguiTransformerBabelPreset()] })],
  resolve: { alias: { "@sparkle": path.join(root, "src") } },
  test: {
    name: "unit",
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
