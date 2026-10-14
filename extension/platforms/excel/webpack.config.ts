import { execSync } from "child_process";
import CopyPlugin from "copy-webpack-plugin";
import dotenv from "dotenv";
import DotenvPlugin from "dotenv-webpack";
import fs from "fs";
import HtmlWebpackPlugin from "html-webpack-plugin";
import os from "os";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import type { Configuration } from "webpack";
import webpack from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";
import WebpackBar from "webpackbar";

import logger from "@app/logger/logger";

import type { Environment } from "../../config/env";
import { getImportMetaEnv } from "../../config/webpack_env";
import {
  linguiCatalogRule,
  linguiMacroLoader,
} from "../../config/webpack_lingui";

const rootDir = path.resolve(__dirname);

const DEV_SERVER_PORT = 3014;

const PUBLIC_PATH = "/excel/";
const DEV_ORIGIN = `https://localhost:${DEV_SERVER_PORT}`;
const PROD_ORIGIN = "https://addins.dust.tt";

const toProdManifest = (content: Buffer) => {
  const manifest = content.toString();
  if (!manifest.includes(DEV_ORIGIN)) {
    throw new Error(`manifest.xml no longer points at ${DEV_ORIGIN}.`);
  }
  return manifest.replaceAll(DEV_ORIGIN, PROD_ORIGIN);
};

// `npx office-addin-dev-certs install` writes these files. It also adds its CA to the keychain.
const DEV_CERTS_DIR = path.join(os.homedir(), ".office-addin-dev-certs");

// Excel desktop rejects a certificate that the system does not trust, and it gives no way to
// accept one. Excel on the web accepts the self-signed certificate of the dev server, after a
// warning, so the installed certificates stay optional.
const getDevServerHttps = (): DevServerConfiguration["server"] => {
  const key = path.join(DEV_CERTS_DIR, "localhost.key");
  const cert = path.join(DEV_CERTS_DIR, "localhost.crt");
  if (fs.existsSync(key) && fs.existsSync(cert)) {
    return { type: "https", options: { key, cert } };
  }

  logger.warn(
    "No office-addin-dev-certs found: Excel desktop will reject the certificate of the dev " +
      "server. Run `npx office-addin-dev-certs install`."
  );
  return "https";
};

const resolvePath = (...segments: string[]) =>
  path.resolve(rootDir, ...segments);

// Get git commit hash
const getCommitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    logger.error({ error: e }, "Failed to read the git commit hash.");
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

  // Production builds go straight into the shared Office origin, served under `/excel/`.
  const buildDirPath = isDevelopment
    ? resolvePath("./build")
    : resolvePath("../../office/dist/excel");

  const envPath = resolvePath(
    isDevelopment ? "../../.env.development" : "../../.env.production"
  );
  // The Dust URLs of the add-in, over the ones of `envPath`. Development only.
  const excelEnvPath = resolvePath("../../.env.development.excel");
  // The dev server proxies `/api` to the local Dust.
  const localDustUrl = isDevelopment
    ? dotenv.parse(fs.readFileSync(envPath, "utf8")).DUST_US_URL
    : undefined;

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
      clean: true,
      filename: isDevelopment ? "[name].js" : "assets/[name].[contenthash].js",
      chunkFilename: isDevelopment
        ? "[id].chunk.js"
        : "assets/[id].[contenthash].chunk.js",
      assetModuleFilename: isDevelopment
        ? "[hash][ext][query]"
        : "assets/[hash][ext][query]",
      publicPath: PUBLIC_PATH,
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
            filename: isDevelopment
              ? "static/fonts/[name][ext]"
              : "assets/[name].[contenthash][ext]",
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
          getImportMetaEnv(isDevelopment ? excelEnvPath : envPath)
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
      // `dotenv-webpack` gives `path` priority over `defaults`, so the add-in's own URLs win.
      new DotenvPlugin(
        isDevelopment
          ? { path: excelEnvPath, defaults: envPath }
          : { path: envPath }
      ),
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
      ...(isDevelopment
        ? []
        : [
            new CopyPlugin({
              patterns: [
                {
                  from: resolvePath("./manifest.xml"),
                  to: "manifest.xml",
                  transform: toProdManifest,
                },
              ],
            }),
          ]),
    ],
    devServer: {
      port: DEV_SERVER_PORT,
      server: getDevServerHttps(),
      proxy: [{ context: ["/api"], target: localDustUrl }],
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
        publicPath: PUBLIC_PATH,
      },
    },
  };
};
