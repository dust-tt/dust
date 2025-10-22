import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

// NoopLLM is a dummy LLM that simply returns "Soupinou!".
export class NoopLLM extends LLM {
  constructor({
    model,
    options,
  }: {
    model: ModelConfigurationType;
    options?: LLMOptions;
  }) {
    super({ model, options });
  }

  async *stream({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    conversation,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent> {
    yield {
      type: "text_delta",
      content: {
        delta: "Soupinou!",
      },
      metadata: {
        providerId: "noop",
        modelId: "dummy_model",
      },
    };
  }

  async *modelStream({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    conversation,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt?: string;
  }): AsyncGenerator<string> {
    yield "Soupinou!";
  }
}
