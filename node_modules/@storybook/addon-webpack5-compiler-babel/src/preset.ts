import type { Options } from "@storybook/types";
import type { Configuration } from "webpack";
import { resolvePathInStorybookCache } from "./utils.js";

const virtualModuleFiles = [
  /storybook-config-entry\.js$/,
  /storybook-stories\.js$/,
];

export const webpackFinal = async (config: Configuration, options: Options) => {
  const babelOptions = await options.presets.apply("babel", {}, options);
  const typescriptOptions = await options.presets.apply(
    "typescript",
    {},
    options,
  );

  config.module = {
    ...(config.module || {}),
    rules: [
      ...(config.module?.rules || []),
      {
        test: typescriptOptions.skipCompiler
          ? /\.((c|m)?jsx?)$/
          : /\.((c|m)?(j|t)sx?)$/,
        use: [
          {
            loader: require.resolve("babel-loader"),
            options: {
              cacheDirectory: resolvePathInStorybookCache("babel"),
              ...babelOptions,
            },
          },
        ],
        exclude: [/node_modules/, ...virtualModuleFiles],
      },
    ],
  };

  return config;
};
