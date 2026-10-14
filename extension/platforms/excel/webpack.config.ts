import { execSync } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import type { Configuration } from "webpack";
import webpack from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";
import WebpackBar from "webpackbar";

import type { Environment } from "../../config/env";
import { getImportMetaEnvFromVars } from "../../config/webpack_env";
import {
  linguiCatalogRule,
  linguiMacroLoader,
} from "../../config/webpack_lingui";
import { getSignInProxy } from "./dev/sign_in_proxy";

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

const DEV_SERVER_PORT = 3014;
const DEV_ADD_IN_ORIGIN = `https://localhost:${DEV_SERVER_PORT}`;

// The Dust URLs that the bundle calls. In development, they are replaced by the add-in origin and
// the dev server proxies them to the local Dust (see `dev/sign_in_proxy.ts`): the Excel WebView
// blocks plain-HTTP requests from the HTTPS task pane, and the Office dialog loads only HTTPS pages.
const DUST_URL_ENV_VARS = [
  "DUST_US_URL",
  "DUST_EU_URL",
  "DUST_API_URL_US",
  "DUST_API_URL_EU",
  "DUST_API_URL_CELL_00002",
];

// Replaces `process.env.<KEY>` for each variable, as `dotenv-webpack` does. Bare `process.env` is
// also replaced: webpack 5 does not polyfill `process`, so any other `process.env.FOO` would throw.
const defineEnvVars = (vars: Record<string, string>) =>
  Object.fromEntries([
    ["process.env", JSON.stringify("MISSING_ENV_VAR")],
    ...Object.entries(vars).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  ]);

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

  const fileVars = dotenv.parse(
    fs.readFileSync(
      resolvePath(
        isDevelopment ? "../../.env.development" : "../../.env.production"
      ),
      "utf8"
    )
  );
  const envVars = isDevelopment
    ? {
        ...fileVars,
        ...Object.fromEntries(
          DUST_URL_ENV_VARS.map((key) => [key, DEV_ADD_IN_ORIGIN])
        ),
      }
    : fileVars;
  if (isDevelopment && !fileVars.WORKOS_AUTHKIT_URL) {
    throw new Error("WORKOS_AUTHKIT_URL must be set in .env.development.");
  }
  const signInProxy = isDevelopment
    ? getSignInProxy({
        addInOrigin: DEV_ADD_IN_ORIGIN,
        dustUrl: fileVars.DUST_US_URL,
        authKitOrigin: fileVars.WORKOS_AUTHKIT_URL,
      })
    : null;

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
        "import.meta.env": JSON.stringify(getImportMetaEnvFromVars(envVars)),
        ...defineEnvVars(envVars),
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
      port: DEV_SERVER_PORT,
      server: "https",
      ...(signInProxy
        ? {
            proxy: signInProxy.proxy,
            // Uses the certificate that the dev server made for itself.
            onListening: (devServer) => {
              const { server } = devServer.options;
              if (typeof server === "object" && server.options) {
                signInProxy.startAuthKitMirror(server.options);
              }
            },
          }
        : {}),
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
