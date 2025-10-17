/// <reference types="node" />
import { defineConfig } from "tsup";
import dotenvFlow from "dotenv-flow";

const nodeEnv = process.env.NODE_ENV || "development";

// Load environment variables based on NODE_ENV
const { parsed } = dotenvFlow.config({
  node_env: nodeEnv,
});

console.log(`Building for environment: ${nodeEnv}`);

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Inject environment variables into the build
  env: parsed,
  sourcemap: true,
  target: "node16",
  esbuildOptions(options) {
    // Alias @app paths to the front directory
    options.alias = {
      "@app/types/api/credentials": "./src/utils/credentials.ts",
      "@app": "../front",
    };
  },
});
