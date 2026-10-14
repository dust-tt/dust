import { execSync } from "child_process";
import Dotenv from "dotenv-webpack";
import fs from "fs";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import type { Configuration } from "webpack";
import webpack from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";
import WebpackBar from "webpackbar";

import type { Environment } from "../../config/env";
import { getImportMetaEnv } from "../../config/webpack_env";
import {
  linguiCatalogRule,
  linguiMacroLoader,
} from "../../config/webpack_lingui";

const rootDir = path.resolve(__dirname);

const resolvePath = (...segments: string[]) =>
  path.resolve(rootDir, ...segments);

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
}: {
  env: Environment;
}): Promise<Configuration & { devServer: DevServerConfiguration }> => {
  const isDevelopment = env === "development";
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
  );
  const version = packageJson.version;

  const buildDirPath = resolvePath("./build");

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
    },
    performance: false,
    devtool: isDevelopment ? "inline-source-map" : undefined,
    entry: {
      main: resolvePath("./main.tsx"),
      auth: resolvePath("./dialog/auth.ts"),
    },
    output: {
      path: buildDirPath,
      filename: "[name].js",
      chunkFilename: "[id].chunk.js",
      publicPath: "/",
    },
    resolve: {
      extensions: [".js", ".json", ".mjs", ".jsx", ".ts", ".tsx"],
      alias: {
        "@extension": path.resolve(__dirname, "../../"),
        "@app/logger/logger": path.resolve(
          __dirname,
          "../../../front/logger/datadogLogger.ts"
        ),
        "@app/lib/platform": path.resolve(__dirname, "../../shared/platform"),
        "@app": path.resolve(__dirname, "../../../front"),
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
        zlib: false,
        assert: require.resolve("assert"),
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
            {
              loader: "css-loader",
              options: {
                modules: {
                  auto: true,
                  namedExport: false,
                },
              },
            },
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
          use: [
            {
              loader: "ts-loader",
              options: {
                configFile: resolvePath("../../tsconfig.json"),
                transpileOnly: true,
              },
            },
            linguiMacroLoader,
          ],
          exclude: /node_modules/,
        },
        linguiCatalogRule,
        {
          test: /\.woff2$/i,
          type: "asset/resource",
          generator: {
            filename: "static/fonts/[name][ext]",
          },
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        global: "globalThis",
        // Expose VITE_* vars on `import.meta.env` so the shared `front`
        // CellContext can resolve the cell API base URL in the webpack
        // build (Vite only injects these in the SPA).
        "import.meta.env": JSON.stringify(
          getImportMetaEnv(
            resolvePath(
              isDevelopment ? "../../.env.development" : "../../.env.production"
            )
          )
        ),
      }),
      new WebpackBar({
        name: `DustExcel [${env}]`,
        color: "#3B82F6",
      }),
      new webpack.EnvironmentPlugin({
        BUILD_DATE: process.env.COMMIT_HASH || Math.floor(Date.now() / 1000),
        COMMIT_HASH: process.env.COMMIT_HASH || getCommitHash(),
        DATADOG_CLIENT_TOKEN: process.env.DATADOG_CLIENT_TOKEN || "",
        DATADOG_ENV: isDevelopment ? "dev" : "prod",
        DUST_EXTENSION_VERSION: `excel-${version}`,
        NEXT_PUBLIC_DUST_APP_URL: process.env.NEXT_PUBLIC_DUST_APP_URL || "",
        NEXT_PUBLIC_DUST_API_URL: process.env.NEXT_PUBLIC_DUST_API_URL || "",
        NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL:
          process.env.NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL || "",
        NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY:
          process.env.NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY || "",
        VIZ_PUBLIC_URL: process.env.VIZ_PUBLIC_URL || "",
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new Dotenv({
        path: isDevelopment
          ? resolvePath("../../.env.development")
          : resolvePath("../../.env.production"),
      }),
      new HtmlWebpackPlugin({
        template: resolvePath("./taskpane.html"),
        filename: "taskpane.html",
        chunks: ["main"],
      }),
      new HtmlWebpackPlugin({
        template: resolvePath("./dialog/auth.html"),
        filename: "auth.html",
        chunks: ["auth"],
      }),
    ],
    devServer: {
      port: 3014,
      server: "https",
      hot: true,
      client: {
        overlay: {
          // Virtuoso's ResizeObserver re-layouts while messages stream in,
          // which the browser reports as a benign error on every token.
          runtimeErrors: (error: Error) =>
            !error.message.includes("ResizeObserver loop"),
        },
      },
      static: {
        directory: buildDirPath,
      },
    },
  };
};
