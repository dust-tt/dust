import type { Environment } from "@app/config/env";
import Dotenv from "dotenv-webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";

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
        "@app": path.resolve(__dirname, "../../"),
      },
      fallback: {
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        url: require.resolve("url/"),
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
      new Dotenv({
        path: isDevelopment
          ? path.resolve(__dirname, "../../.env.development")
          : path.resolve(__dirname, "../../.env.production"),
      }),
    ].filter(Boolean),
    devServer: {
      port: 3010,
      hot: true,
      static: {
        directory: path.resolve(__dirname, "./build"),
      },
      historyApiFallback: true,
    },
  };
};
