import { describe, it } from "vitest";

import { runConversation } from "@app/lib/api/llm/tests/conversations";
import type {
  RunnabletestConversation as RunnableTestConversation,
  TestConfig,
} from "@app/lib/api/llm/tests/types";
import type { TestConversation } from "@app/scripts/llm_router/types";
import type { ModelIdType, ModelProviderIdType } from "@app/types";

const TIMEOUT = 60 * 1000; // 60 seconds

const RUN_LLM_TESTS = process.env.VITE_RUN_LLM_TESTS === "true";

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
