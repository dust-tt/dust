import type { LLMWithTracingParameters } from "@app/lib/api/llm/llm";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { Authenticator } from "@app/lib/auth";
import type { ModelConversationTypeMultiActions } from "@app/types";

// NoopLLM is a dummy LLM that simply returns "Soupinou!".
export class NoopLLM extends LLM {
  constructor(
    auth: Authenticator,
    args: LLMWithTracingParameters & { modelId: "noop" }
  ) {
    super(auth, args);
  }

  async *internalStream({
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
