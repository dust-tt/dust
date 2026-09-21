import { defineConfig } from "vite";
import { mergeConfig } from "vite";

import baseConfig from "../../vite.config.mjs";

export default defineConfig(() => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `NODE_ENV must be set to "test" (value: ${process.env.NODE_ENV}). Action: make sure your have the correct environment variable set.`
    );
  }

  // Extended config specific to conversational-building evaluation tests
  const testConfig = defineConfig({
    test: {
      // The evals only talk to the LLM APIs: no DOM needed, and the provider SDKs
      // refuse to run in a browser-like environment.
      environment: "node",
      env: {
        // Skip tests by default, unless explicitly enabled
        RUN_CONVERSATIONAL_BUILDING_EVAL: process.env.RUN_CONVERSATIONAL_BUILDING_EVAL ?? "false",
        FILTER_CATEGORY: process.env.FILTER_CATEGORY ?? "",
        FILTER_SCENARIO: process.env.FILTER_SCENARIO ?? "",
        JUDGE_RUNS: process.env.JUDGE_RUNS ?? "3",
        PASS_THRESHOLD: process.env.PASS_THRESHOLD ?? "2",
        BUILDING_MODEL_ID: process.env.BUILDING_MODEL_ID ?? "",
        BUILDING_REASONING_EFFORT: process.env.BUILDING_REASONING_EFFORT ?? "",
        VERBOSE: process.env.VERBOSE ?? "false",
        // The base global setup (skipped here) silences the logger; without this every cache
        // invalidation and the idle-in-transaction watchdog print during the runs.
        LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
        // Map API keys from non-VITE env vars to VITE prefixed ones for browser compatibility
        DUST_MANAGED_ANTHROPIC_API_KEY:
          process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
        DUST_MANAGED_OPENAI_API_KEY:
          process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
      },
      testTimeout: 300000,
      maxConcurrency: parseInt(process.env.EVAL_MAX_CONCURRENCY ?? "5", 10),
    },
  });

  // Merge with the base config and explicitly override globalSetup
  const merged = mergeConfig(baseConfig, testConfig);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  merged.test.globalSetup = []; // Force override the globalSetup
  return merged;
});
