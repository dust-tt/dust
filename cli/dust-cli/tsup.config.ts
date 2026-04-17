/// <reference types="node" />

import { readFileSync } from "fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const nodeEnv = process.env.NODE_ENV || "development";


console.log(`Building for environment: ${nodeEnv}`);

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  sourcemap: true,
  target: "node16",
});
