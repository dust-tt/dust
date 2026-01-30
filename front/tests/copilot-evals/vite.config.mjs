import { defineConfig } from "vite";
import { mergeConfig } from "vite";

import baseConfig from "../../vite.config.mjs";

export default defineConfig(() => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `NODE_ENV must be set to "test" (value: ${process.env.NODE_ENV}). Action: make sure your have the correct environment variable set.`
    );
  }

  // Extended config specific to copilot evaluation tests
  const testConfig = defineConfig({
    test: {
      env: {
        // Skip tests by default, unless explicitly enabled
        RUN_COPILOT_EVAL: process.env.RUN_COPILOT_EVAL ?? "false",
        FILTER_CATEGORY: process.env.FILTER_CATEGORY ?? "",
        FILTER_SCENARIO: process.env.FILTER_SCENARIO ?? "",
        JUDGE_RUNS: process.env.JUDGE_RUNS ?? "3",
        PASS_THRESHOLD: process.env.PASS_THRESHOLD ?? "2",
        // Map API keys from non-VITE env vars to VITE prefixed ones for browser compatibility
        DUST_MANAGED_ANTHROPIC_API_KEY:
          process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
        DUST_MANAGED_OPENAI_API_KEY:
          process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
      },
      testTimeout: 300000,
    },
  });

  // Merge with the base config and explicitly override globalSetup
  const merged = mergeConfig(baseConfig, testConfig);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  merged.test.globalSetup = []; // Force override the globalSetup
  return merged;
});
