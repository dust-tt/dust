import { linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";
import { fileURLToPath } from "url";
import { searchForWorkspaceRoot } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  staticDirs: [
    { from: "../../front/public/static", to: "/static" },
    { from: "./assets", to: "/brand" },
  ],

  addons: [
    "@storybook/addon-themes",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    // Generates AI manifests (/manifests/components.json, /manifests/docs.json)
    // and serves the MCP endpoint at /mcp. Stories tagged "!manifest" are
    // excluded from the manifests.
    "@storybook/addon-mcp",
    "storybook-addon-tag-badges",
  ],

  viteFinal: async (viteConfig) => {
    return {
      ...viteConfig,
      plugins: [
        ...(viteConfig.plugins ?? []),
        // Compiles the Lingui macros (`<Trans>`, `useLingui`) used in sparkle components, as in
        // vitest.unit.config.ts.
        babel({ presets: [linguiTransformerBabelPreset()] }),
      ],
      server: {
        ...viteConfig.server,
        fs: {
          ...viteConfig.server?.fs,
          allow: [
            ...(viteConfig.server?.fs?.allow ?? [
              searchForWorkspaceRoot(__dirname),
            ]),
            path.resolve(
              path.dirname(
                fileURLToPath(import.meta.resolve("@storybook/addon-vitest"))
              ),
              "../../.."
            ),
          ],
        },
      },
      resolve: {
        ...(viteConfig.resolve ?? {}),
        alias: {
          ...(viteConfig.resolve?.alias ?? {}),
          "@dust-tt/sparkle": path.resolve(__dirname, "../src/"),
          "@sparkle": path.resolve(__dirname, "../src/"),
        },
      },
    };
  },

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};
export default config;
