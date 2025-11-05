import { describe, it } from "vitest";

import { runConversation } from "@app/lib/api/llm/tests/conversations";
import type {
  RunnabletestConversation as RunnableTestConversation,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType, ModelProviderIdType } from "@app/types";

const TIMEOUT = 60 * 1000; // 60 seconds

const RUN_LLM_TESTS = process.env.VITE_RUN_LLM_TESTS === "true";

/**
 * Abstract test suite for LLM clients.
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
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_OPENAI_API_KEY=$DUST_MANAGED_OPENAI_API_KEY npm run test -- __test__/openai.test.ts
 * ```
 *
 * It is recommended to run these tests locally before pushing changes that affect LLM clients,
 * for instance, when adding a new model.
 */
export abstract class LLMClientTestSuite {
  protected abstract provider: ModelProviderIdType;
  protected abstract models: ModelIdType[];

  protected abstract getTestConfig(modelId: ModelIdType): TestConfig[];
  protected abstract getSupportedConversations(
    modelId: ModelIdType
  ): TestConversation[];

  protected getConversationsToRun(
    modelId: ModelIdType
  ): RunnableTestConversation[] {
    return this.getSupportedConversations(modelId).map((conversation) => ({
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
            describe(`Config: temperature=${config.temperature}, reasoningEffort=${config.reasoningEffort}`, () => {
              this.getConversationsToRun(model).forEach((conversation) => {
                it(
                  `should handle: ${conversation.name}`,
                  async () => {
                    await conversation.run(config);
                  },
                  TIMEOUT
                );
              });
            });
          });
        });
      });
    });
  }
}
