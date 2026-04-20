import { defineConfig } from "vite";
import { mergeConfig } from "vite";

import baseConfig from "../../vite.config.mjs";

export default defineConfig(() => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `NODE_ENV must be set to "test" (value: ${process.env.NODE_ENV}). Action: make sure your have the correct environment variable set.`
    );
  }

  const testConfig = defineConfig({
    test: {
      env: {
        // Silence the app logger (the base globalSetup sets this, but we
        // override globalSetup to [] so we must set it ourselves).
        LOG_LEVEL: "silent",
        // Skip tests by default, unless explicitly enabled.
        RUN_TAKEAWAY_EVAL: process.env.RUN_TAKEAWAY_EVAL ?? "false",
        // Filtering.
        FILTER_SCENARIO: process.env.FILTER_SCENARIO ?? "",
        // Judge configuration.
        JUDGE_RUNS: process.env.JUDGE_RUNS ?? "3",
        PASS_THRESHOLD: process.env.PASS_THRESHOLD ?? "2",
        // Model override for the takeaway extraction LLM.
        VERBOSE: process.env.VERBOSE ?? "false",
        TAKEAWAY_MODEL_ID: process.env.TAKEAWAY_MODEL_ID ?? "",
        // API keys forwarded from the shell environment.
        DUST_MANAGED_ANTHROPIC_API_KEY:
          process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
        DUST_MANAGED_OPENAI_API_KEY:
          process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
      },
      testTimeout: 300000,
    },
  });

  // Merge with base config and override globalSetup.
  const merged = mergeConfig(baseConfig, testConfig);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  merged.test.globalSetup = [];
  return merged;
});
