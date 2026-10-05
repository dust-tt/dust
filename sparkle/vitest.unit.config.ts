import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Same macro compilation as `npm run build:i18n`.
  plugins: [
    react({
      jsxRuntime: "classic",
      babel: {
        plugins: [
          [
            "@lingui/babel-plugin-lingui-macro",
            { descriptorFields: "message" },
          ],
        ],
      },
    }),
  ],
  resolve: { alias: { "@sparkle": path.join(root, "src") } },
  test: {
    name: "unit",
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
