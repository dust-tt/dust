import { describe, it, vi } from "vitest";

import {
  runConversation,
  TEST_CONVERSATIONS,
} from "@app/lib/api/llm/tests/conversations";
import type {
  RunnabletestConversation as RunnableTestConversation,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType, ModelProviderIdType } from "@app/types";
import { GEMINI_3_PRO_MODEL_ID } from "@app/types";

const TIMEOUT = 60 * 1000; // 60 seconds

const RUN_LLM_TESTS = process.env.VITE_RUN_LLM_TESTS === "true";

const TEST_CONFIGS = [
  [
    { reasoningEffort: null },
    { reasoningEffort: "none" },
    { reasoningEffort: "light" },
    { reasoningEffort: "medium" },
    { reasoningEffort: "high" },
    { temperature: 1 },
    { temperature: 0.7 },
    { temperature: 0 },
    { temperature: 0.7, reasoningEffort: "medium" },
  ],
];

// Inject Dust managed Anthropic credentials for testing
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      ANTHROPIC_API_KEY: process.env.VITE_DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
      OPENAI_API_KEY: process.env.VITE_DUST_MANAGED_OPENAI_API_KEY ?? "",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      GOOGLE_AI_STUDIO_API_KEY:
        process.env.VITE_DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
      MISTRAL_API_KEY: process.env.VITE_DUST_MANAGED_MISTRAL_API_KEY ?? "",
      FIREWORKS_API_KEY: process.env.VITE_DUST_MANAGED_FIREWORKS_API_KEY ?? "",
      XAI_API_KEY: process.env.VITE_DUST_MANAGED_XAI_API_KEY ?? "",
    })),
  };
});

// Mock the openai module to inject dangerouslyAllowBrowser: true
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalOpenAI = actual.OpenAI;

  class OpenAIWithBrowserSupport extends OriginalOpenAI {
    constructor(config: ConstructorParameters<typeof OriginalOpenAI>[0]) {
      super({
        ...config,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    OpenAI: OpenAIWithBrowserSupport,
  };
});

/**
 * Test suite for LLM clients.
 *
 * Generates and runs tests for different models, configurations and conversations for a given LLM provider.
 *
 * These tests are disabled by default as we don't want to run them on every CI run (dues to costs of LLM usage).
 * To enable them, set the environment variable VITE_RUN_LLM_TESTS to "true".
 * Additionally, make sure to provide the necessary API keys via environment variables.
 *
 * Example of running the tests with OpenAI:
 *
 * ```bash
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_OPENAI_API_KEY=$DUST_MANAGED_OPENAI_API_KEY npm run test -- lib/api/llm/tests/llm.test.ts
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_ANTHROPIC_API_KEY=$DUST_MANAGED_ANTHROPIC_API_KEY npm run test -- lib/api/llm/tests/llm.test.ts
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY=$DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY npm run test -- lib/api/llm/tests/llm.test.ts
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_MISTRAL_API_KEY=$DUST_MANAGED_MISTRAL_API_KEY npm run test -- lib/api/llm/tests/llm.test.ts
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_FIREWORKS_API_KEY=$DUST_MANAGED_FIREWORKS_API_KEY npm run test -- lib/api/llm/tests/llm.test.ts
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_XAI_API_KEY=$DUST_MANAGED_XAI_API_KEY npm run test -- lib/api/llm/tests/llm.test.ts
 * ```
 *
 * It is recommended to run these tests locally before pushing changes that affect LLM clients,
 * for instance, when adding a new model.
 */
class LLMClientTestSuite {
  // Set the right provider
  protected provider: ModelProviderIdType = "google_ai_studio";
  // Add the models to test here
  protected models: ModelIdType[] = [GEMINI_3_PRO_MODEL_ID];

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    return TEST_CONFIGS.map((configParams) => ({
      ...configParams,
      modelId,
      provider: this.provider,
    }));
  }
  protected getSupportedConversations(
    _modelId: ModelIdType
  ): TestConversation[] {
    return TEST_CONVERSATIONS;
  }

  protected getConversationsToRun(): RunnableTestConversation[] {
    return TEST_CONVERSATIONS.map((conversation) => ({
      name: conversation.name,
      run: async (config: TestConfig) => {
        await runConversation(conversation, config);
      },
    }));
  }

  public generateTests(): void {
    describe.runIf(RUN_LLM_TESTS)(`${this.provider} LLM provider tests`, () => {
      this.models.forEach((model) => {
        describe(`Model: ${model}`, () => {
          this.getTestConfig(model).forEach((config) => {
            describe(`Config: temperature=${config.temperature}, reasoningEffort=${config.reasoningEffort}, responseFormat=${config.testStructuredOutputKey}`, () => {
              this.getConversationsToRun().forEach((conversation) => {
                it(
                  `should handle: ${conversation.name}`,
                  { concurrent: true, timeout: TIMEOUT },
                  async () => {
                    await conversation.run(config);
                  }
                );
              });
            });
          });
        });
      });
    });
  }
}

new LLMClientTestSuite().generateTests();
