import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import autoprefixer from "autoprefixer";
import fs from "fs";
import path from "path";
import external from "rollup-plugin-peer-deps-external";
import postcss from "rollup-plugin-postcss";
import tailwindcss from "tailwindcss";
import { fileURLToPath } from "url";

let tsPluginOptions = {
  tsconfig: "./tsconfig.json",
  outputToFilesystem: true,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8")
);

let entryFile = "src/index.ts";
tsPluginOptions.exclude = "src/index_with_tw_base.ts";
if (process.env.INCLUDE_TW_BASE) {
  entryFile = "src/index_with_tw_base.ts";
  tsPluginOptions.exclude = "src/index.ts";
}

const config = {
  input: entryFile,
  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
      name: "react-lib",
    },
    {
      file: pkg.module,
      format: "esm",
      sourcemap: true,
    },
  ],
  plugins: [
    external(),
    resolve(),
    commonjs(),
    typescript(tsPluginOptions),
    postcss({
      plugins: [
        tailwindcss({
          config: path.resolve(__dirname, "tailwind.config.js"),
          corePlugins: {
            preflight: !!process.env.INCLUDE_TW_BASE,
          },
        }),
        autoprefixer(),
      ],
      inject: true,
      extract: false,
    }),
    json(),
  ],
};

export default config;
