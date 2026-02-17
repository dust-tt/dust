/// <reference types="node" />

import dotenvFlow from "dotenv-flow";
import { readFileSync } from "fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const nodeEnv = process.env.NODE_ENV || "development";

// Load environment variables based on NODE_ENV
const { parsed } = dotenvFlow.config({
  node_env: nodeEnv,
});

console.log(`Building for environment: ${nodeEnv}`);

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  // Inject environment variables into the build
  env: parsed,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  sourcemap: true,
  target: "node16",
});
