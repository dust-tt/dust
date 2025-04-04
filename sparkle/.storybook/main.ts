import type { StorybookConfig } from "@storybook/react-webpack5";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  staticDirs: [{ from: "../../front/public/static", to: "/static" }],

  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-themes",
    {
      name: "@storybook/addon-styling",
      options: {
        // Check out https://github.com/storybookjs/addon-styling/blob/main/docs/api.md
        // For more details on this addon's options.
        postCss: {
          implementation: require.resolve("postcss"),
        },
      },
    },
    "@storybook/addon-webpack5-compiler-babel",
    "@chromatic-com/storybook",
  ],

  webpackFinal: async (config, { configType }) => {
    config.resolve = {
      ...(config.resolve || {}),
      alias: {
        ...(config.resolve?.alias || {}),
        "@sparkle": path.resolve(__dirname, "../src/"),
        "/static": path.resolve(__dirname, "../../front/public/static"),
      },
    };

    config.module = {
      ...(config.module || {}),
      rules: [
        ...(config.module?.rules || []),
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: "asset/resource",
        },
      ],
    };

    config.externals = {
      "jest-util": "jest-util",
    };

    return config;
  },

  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },

  docs: {},

  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};
export default config;
