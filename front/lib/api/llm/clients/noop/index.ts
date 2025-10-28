import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelConversationTypeMultiActions } from "@app/types";

// NoopLLM is a dummy LLM that simply returns "Soupinou!".
export class NoopLLM extends LLM {
  constructor(args: LLMParameters & { modelId: "noop" }) {
    super(args);
  }

  async *stream({
    conversation: _conversation,
    prompt: _prompt,
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
        clientId: "noop",
        modelId: "noop",
      },
    };
  }
}
