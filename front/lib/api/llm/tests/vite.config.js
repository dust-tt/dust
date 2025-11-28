import { defineConfig } from "vite";
import { mergeConfig } from "vite";

import baseConfig from "../../../../vite.config.mjs";

export default defineConfig(() => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `NODE_ENV must be set to "test" (value: ${process.env.NODE_ENV}). Action: make sure your have the correct environment variable set.`
    );
  }

  // Extended config specific to LLM tests
  const testConfig = defineConfig({
    test: {
      env: {
        // Skip tests by default, unless explicitly enabled
        RUN_LLM_TEST: process.env.RUN_LLM_TEST ?? "false",
        // Map API keys from non-VITE env vars to VITE prefixed ones for browser compatibility
        DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY:
          process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
        DUST_MANAGED_OPENAI_API_KEY:
          process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
        DUST_MANAGED_MISTRAL_API_KEY:
          process.env.DUST_MANAGED_MISTRAL_API_KEY ?? "",
        DUST_MANAGED_ANTHROPIC_API_KEY:
          process.env.DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
        DUST_MANAGED_FIREWORKS_API_KEY:
          process.env.DUST_MANAGED_FIREWORKS_API_KEY ?? "",
        DUST_MANAGED_XAI_API_KEY: process.env.DUST_MANAGED_XAI_API_KEY ?? "",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        // When not empty, filter the conversations to run (comma-separated list of conversation IDs)
        FILTER_CONVERSATION_IDS: process.env.FILTER_CONVERSATION_IDS ?? "",
        // When set to "true", run all model tests regardless of their `runTest` flag
        RUN_ALL_MODEL_TESTS: process.env.RUN_ALL_MODEL_TESTS ?? "false",
      },
    },
  });

  // Merge with the base config and explicitly override globalSetup
  const merged = mergeConfig(baseConfig, testConfig);
  merged.test.globalSetup = []; // Force override the globalSetup
  return merged;
});
