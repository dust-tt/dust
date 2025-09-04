import type { Environment } from "@app/config/env";
import CopyWebpackPlugin from "copy-webpack-plugin";
import Dotenv from "dotenv-webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";

export const getConfig = ({ env }: { env: Environment }) => {
  const isDevelopment = env === "development";

  return {
    mode: isDevelopment ? "development" : "production",
    entry: {
      taskpane: path.resolve(__dirname, "./src/taskpane.js"),
      commands: path.resolve(__dirname, "./src/commands.js"),
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "./build"),
      publicPath: "/",
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-env"],
            },
          },
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
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
      extensions: [".js", ".json"],
      alias: {
        "@app": path.resolve(__dirname, "../../"),
      },
    },
    externals: {
      "office-js": "Office",
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "./src/taskpane.html"),
        filename: "taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "./src/commands.html"),
        filename: "commands.html",
        chunks: ["commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "./src/taskpane.css"),
            to: "taskpane.css",
          },
          {
            from: path.resolve(__dirname, "./manifest.xml"),
            to: "manifest.xml",
          },
        ],
      }),
      new Dotenv({
        path: isDevelopment
          ? path.resolve(__dirname, "../../.env.development")
          : path.resolve(__dirname, "../../.env.production"),
      }),
    ].filter(Boolean),
    devServer: {
      port: 3011,
      hot: true,
      static: {
        directory: path.resolve(__dirname, "./build"),
      },
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      server: "https",
      historyApiFallback: true,
    },
  };
};