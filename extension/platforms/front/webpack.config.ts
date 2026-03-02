import type { Environment } from "@extension/config/env";
import { execSync } from "child_process";
import Dotenv from "dotenv-webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";

// Get git commit hash
const getCommitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    console.error(e);
    return "development";
  }
};

export const getConfig = ({ env }: { env: Environment }) => {
  const isDevelopment = env === "development";

  return {
    mode: isDevelopment ? "development" : "production",
    entry: path.resolve(__dirname, "./main.tsx"),
    output: {
      filename: "main.js",
      path: path.resolve(__dirname, "./build"),
      publicPath: "/",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              configFile: path.resolve(__dirname, "../../tsconfig.json"),
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  config: path.resolve(
                    __dirname,
                    "../../config/postcss.config.js"
                  ),
                },
              },
            },
          ],
        },
      ],
    },
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
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@extension": path.resolve(__dirname, "../../"),
        "@app/lib/platform": path.resolve(__dirname, "../../shared/platform"),
        "@app": path.resolve(__dirname, "../../../front"),
      },
      fallback: {
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        url: require.resolve("url/"),
        zlib: false,
        assert: require.resolve("assert"),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "../../ui/main.html"),
        filename: "index.html",
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),

      new webpack.EnvironmentPlugin({
        COMMIT_HASH: getCommitHash(),
        DATADOG_CLIENT_TOKEN: process.env.DATADOG_CLIENT_TOKEN || "",
        DATADOG_ENV: isDevelopment ? "dev" : "prod",
        NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY:
          process.env.NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY || "",
        NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER:
          process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER || "",
        NEXT_PUBLIC_NOVU_API_URL: process.env.NEXT_PUBLIC_NOVU_API_URL || "",
        NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL:
          process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL || "",
        NEXT_PUBLIC_DUST_APP_URL: process.env.NEXT_PUBLIC_DUST_APP_URL || "",
        VIZ_PUBLIC_URL: process.env.VIZ_PUBLIC_URL || "",
      }),
      new Dotenv({
        path: isDevelopment
          ? path.resolve(__dirname, "../../.env.development")
          : path.resolve(__dirname, "../../.env.production"),
      }),
    ].filter(Boolean),
    devServer: {
      port: 3012,
      hot: true,
      static: {
        directory: path.resolve(__dirname, "./build"),
      },
      historyApiFallback: true,
    },
  };
};
