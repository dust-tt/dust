import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "url";
import path from "path";
import { searchForWorkspaceRoot } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../../viz/components/dust/document/v1/DocumentRoot.stories.tsx",
  ],

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
      esbuild: { ...viteConfig.esbuild, jsx: "automatic" },
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
          "@sparkle": path.resolve(__dirname, "../src/"),
          "@dust-tt/sparkle/dist/esm": path.resolve(__dirname, "../src"),
          "@viz": path.resolve(__dirname, "../../viz"),
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
