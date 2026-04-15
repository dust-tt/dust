import { mergeConfig } from "vite";

import baseConfig from "../../../../vite.config.mjs";

const config = mergeConfig(baseConfig, {
  test: {
    globalSetup: [],
    environment: "node",
  },
});

// mergeConfig deep-merges arrays, so we must override after merging.
config.test.globalSetup = [];

export default config;
