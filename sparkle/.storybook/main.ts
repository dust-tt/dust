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
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
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
