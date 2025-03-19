import { execSync } from "child_process";
import CopyPlugin from "copy-webpack-plugin";
import Dotenv from "dotenv-webpack";
import fs from "fs";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import { promisify } from "util";
import type { Configuration } from "webpack";
import webpack from "webpack";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import ExtReloader from "webpack-ext-reloader";
import WebpackBar from "webpackbar";
import ZipPlugin from "zip-webpack-plugin";

import type { Environment } from "../../config/env";

const rootDir = path.resolve(__dirname);

const resolvePath = (...segments: string[]) =>
  path.resolve(rootDir, ...segments);

const readFileAsync = promisify(fs.readFile).bind(fs) as (
  path: string
) => Promise<string>;

// Get git commit hash
const getCommitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    console.error(e);
    return "development";
  }
};

export const getConfig = async ({
  env,
  shouldBuild,
}: {
  env: Environment;
  shouldBuild: "none" | "prod" | "analyze";
}): Promise<Configuration> => {
  const isDevelopment = env === "development";
  const baseManifestPath = resolvePath("./manifests/manifest.base.json");
  const envManifestPath = resolvePath(`./manifests/manifest.${env}.json`);

  const baseManifest = JSON.parse(await readFileAsync(baseManifestPath));
  const envManifest = JSON.parse(await readFileAsync(envManifestPath));
  const mergedManifest = { ...baseManifest, ...envManifest };
  const version = mergedManifest.version;

  const buildDirPath = resolvePath("./build");

  const packageDirPath =
    shouldBuild === "prod" ? resolvePath("../../packages") : null;

  return {
    mode: isDevelopment ? "development" : "production",
    node: false,
    optimization: {
      minimize: !isDevelopment,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            output: {
              ascii_only: true,
            },
          },
        }),
      ],
      concatenateModules: shouldBuild !== "analyze",
    },
    performance: false,
    devtool: isDevelopment ? "inline-source-map" : undefined,
    entry: {
      main: resolvePath("./main.tsx"),
      background: resolvePath("./background.ts"),
      page: resolvePath("./page.ts"),
    },
    output: {
      path: buildDirPath,
      filename: "[name].js",
      chunkFilename: "[id].chunk.js",
    },
    resolve: {
      extensions: [".js", ".json", ".mjs", ".jsx", ".ts", ".tsx"],
      alias: {
        "@app": path.resolve(__dirname, "../../"),
        redis: false,
      },
      fallback: {
        url: false,
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        path: false,
        fs: false,
        crypto: false,
        events: false,
        net: false,
        redis: false,
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
      },
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
                  config: resolvePath("../../config/postcss.config.js"),
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
              configFile: resolvePath("../../tsconfig.json"),
            },
          },
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        global: "globalThis",
      }),
      new WebpackBar({
        name: `DustExt [${env}]`,
        color: "#3B82F6",
      }),
      new webpack.EnvironmentPlugin({
        VERSION: version,
        COMMIT_HASH: getCommitHash(),
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new Dotenv({
        path: isDevelopment
          ? resolvePath("../../.env.development")
          : resolvePath("../../.env.production"),
      }),
      new CopyPlugin({
        patterns: [
          {
            from: baseManifestPath,
            transform: (content) => {
              const finalManifest = {
                ...JSON.parse(content.toString()),
                ...envManifest,
              };
              return Buffer.from(JSON.stringify(finalManifest, null, 2));
            },
            to: path.join(buildDirPath, "manifest.json"),
          },
          {
            from: resolvePath("../../ui/main.html"),
            to: path.join(buildDirPath, "main.html"),
          },
          {
            context: resolvePath("../../ui/images"),
            from: "**/*.png",
            to: path.resolve(buildDirPath, "images"),
          },
        ],
      }),
      new webpack.BannerPlugin({
        banner: "\ufeff", // UTF-8 BOM
        raw: true,
      }),
      ...(shouldBuild === "analyze" ? [new BundleAnalyzerPlugin()] : []),
      packageDirPath
        ? new ZipPlugin({
            path: packageDirPath,
            filename: `Dust_Extension.${env}.v${version}.zip`,
          })
        : null,
      isDevelopment
        ? // @ts-expect-error (it's working)
          new ExtReloader({
            port: 9090,
            reloadPage: true,
            entries: {
              contentScript: "main",
              background: "background",
            },
          })
        : null,
    ].filter(Boolean),
  };
};
