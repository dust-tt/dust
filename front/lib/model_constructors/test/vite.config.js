import { mergeConfig } from "vite";

import baseConfig from "../../../vite.config.mjs";

const config = mergeConfig(baseConfig, {
  test: {
    setupFiles: [],
    globalSetup: [],
    environment: "node",
  },
});

// mergeConfig deep-merges arrays, so we must override after merging.
config.test.setupFiles = [];
config.test.globalSetup = [];

export default config;
