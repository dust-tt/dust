import { createRequire } from "node:module";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig({
  server: {
    fs: {
      // Hive worktrees share dependencies with the main checkout.
      allow: [
        path.resolve(__dirname, ".."),
        path.dirname(path.dirname(require.resolve("storybook/package.json"))),
      ],
    },
  },
  plugins: [storybookTest({ configDir: path.join(__dirname, ".storybook") })],
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      // Scope coverage to hand-written source: remapping the ~2900 generated
      // icon/logo modules exhausts the Node heap and crashes the dev server.
      include: ["src/components/**", "src/hooks/**", "src/lib/**"],
    },
  },
});
