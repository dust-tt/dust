// Rollup configuration for building the library as a cjs bundle. This is used by front workers.
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import autoprefixer from "autoprefixer";
import fs from "fs";
import path from "path";
import external from "rollup-plugin-peer-deps-external";
import postcss from "rollup-plugin-postcss";
import tailwindcss from "tailwindcss";
import { fileURLToPath } from "url";
import terser from "@rollup/plugin-terser";

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
      inlineDynamicImports: true,
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
    // Conditionally include terser based on environment variable
    // Set DISABLE_TERSER=1 to disable minification (fixes webpack exports issue in dev)
    ...(process.env.DISABLE_TERSER
      ? []
      : [
          terser({
            compress: {
              passes: 2,
              drop_console: true,
              keep_fnames: false,
            },
            format: {
              comments: false,
              preserve_annotations: false,
            },
            mangle: {
              properties: false,
            },
            sourceMap: false,
          }),
        ]),
  ],
};

export default config;
