import path from "path";
import fs from "fs";
import { promisify } from "util";
import webpack, { Configuration } from "webpack";
import CopyPlugin from "copy-webpack-plugin";
import ZipPlugin from "zip-webpack-plugin";
import WebpackBar from "webpackbar";
import ExtReloader from "webpack-ext-reloader";
import TerserPlugin from "terser-webpack-plugin";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { ENV_DEV, ENV_PROD, isDevEnv } from "./env";

const readFileAsync = promisify(fs.readFile);
const rootDir = path.resolve(__dirname, "../");
const resolvePath = (...segments: string[]) =>
  path.resolve(rootDir, ...segments);

export const getConfig = async ({
  shouldBuild,
}: {
  shouldBuild: "none" | "prod" | "analyze";
}): Promise<Configuration> => {
  const isDevelopment = isDevEnv();
  const env = isDevelopment ? ENV_DEV : ENV_PROD;

  const manifestFilePath = resolvePath("./manifest.json");
  const maniFestFileRawContent = await readFileAsync(manifestFilePath, "utf8");
  const version = JSON.parse(maniFestFileRawContent).version;

  const buildDirPath = resolvePath("./build");
  const appSrcDirPath = resolvePath("./app/src");

  const packageDirPath =
    shouldBuild === "prod" ? resolvePath("./packages") : null;

  return {
    mode: env,
    node: false,
    optimization: {
      minimize: !isDevelopment,
      minimizer: [new TerserPlugin({ extractComments: false })],
      concatenateModules: shouldBuild !== "analyze",
    },
    performance: false,
    devtool: isDevelopment ? "inline-source-map" : undefined,
    entry: {
      main: "./app/main.tsx",
      background: "./app/background.ts",
    },
    output: {
      path: buildDirPath,
      filename: "[name].js",
      chunkFilename: "[id].chunk.js",
    },
    resolve: {
      extensions: [".js", ".json", ".mjs", ".jsx", ".ts", ".tsx"],
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [
            "style-loader",
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  config: path.resolve(__dirname, "postcss.config.js"),
                },
              },
            },
          ],
        },
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              configFile: resolvePath("./tsconfig.json"),
            },
          },
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new WebpackBar({
        name: `DustExt [${env}]`,
        color: "#3B82F6",
      }),
      new webpack.EnvironmentPlugin({
        VERSION: version,
      }),
      new CopyPlugin({
        patterns: [
          {
            from: manifestFilePath,
            to: path.join(buildDirPath, "manifest.json"),
          },
          {
            from: resolvePath("./app/main.html"),
            to: path.join(buildDirPath, "main.html"),
          },
          {
            context: resolvePath("./app/images"),
            from: "**/*.png",
            to: path.resolve(buildDirPath, "images"),
          },
          // WIP DAPH
          // {
          //   context: appSrcDirPath,
          //   from: path.resolve(appSrcDirPath, "**/*").replace(/\\/g, "/"),
          //   globOptions: {
          //     ignore: ["**/*.js", "**/*.ts", "**/*.tsx"],
          //   },
          //   to: buildDirPath,
          // },
        ],
      }),
      ...(shouldBuild === "analyze" ? [new BundleAnalyzerPlugin()] : []),
      packageDirPath
        ? new ZipPlugin({
            path: packageDirPath,
            filename: `Dust_Extension.v${version}.zip`,
          })
        : null,
      isDevelopment
        ? // @ts-ignore (it's working)
          new ExtReloader({
            manifest: manifestFilePath,
            reloadPage: true,
            entries: {
              background: "background",
            },
          })
        : null,
    ].filter(Boolean),
  };
};
