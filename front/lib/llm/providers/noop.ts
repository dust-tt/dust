import { LLM } from "@app/lib/llm/llm";
import type { LLMEvent } from "@app/lib/llm/types";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

// NoopLLM is a dummy LLM that simply returns "Soupinou!"
export class NoopLLM extends LLM {
  constructor({ model }: { model: ModelConfigurationType }) {
    super(model);
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
