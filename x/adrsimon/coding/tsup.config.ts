/// <reference types="node" />

import dotenvFlow from "dotenv-flow";
import { defineConfig } from "tsup";

const nodeEnv = process.env.NODE_ENV || "development";

const { parsed } = dotenvFlow.config({
  node_env: nodeEnv,
});

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  env: parsed,
  sourcemap: true,
  target: "node16",
});
