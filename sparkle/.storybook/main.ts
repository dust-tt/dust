import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "url";
import path from "path";

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

  viteFinal: async (config) => {
    config.resolve = {
      ...(config.resolve || {}),
      alias: {
        ...(config.resolve?.alias || {}),
        "@sparkle": path.resolve(__dirname, "../src/"),
      },
    };

    return config;
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
