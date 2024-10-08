// Rollup configuration for building the library as a cjs bundle. This is used by front workers.
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import autoprefixer from "autoprefixer";
import fs from "fs";
import path from "path";
import { rollup } from "rollup";
import external from "rollup-plugin-peer-deps-external";
import postcss from "rollup-plugin-postcss";
import tailwindcss from "tailwindcss";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8")
);

let entryFile = "dist/esm/index.js";

const config = {
  input: entryFile,
  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
      name: "react-lib",
    },
  ],
  onwarn(warning, warn) {
    // This is to ignore "use client" directive in radix modules
    if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
      return;
    }
    warn(warning);
  },
  plugins: [
    external(),
    resolve(),
    commonjs(),
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
