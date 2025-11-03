import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";

// NoopLLM is a dummy LLM that simply returns "Soupinou!".
export class NoopLLM extends LLM {
  constructor(auth: Authenticator, args: LLMParameters & { modelId: "noop" }) {
    super(auth, args);
  }

  async *internalStream({
    conversation: _conversation,
    prompt: _prompt,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
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
