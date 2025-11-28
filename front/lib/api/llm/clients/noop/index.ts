import { LLM } from "@app/lib/api/llm/llm";
import type {
  LLMEvent,
  TextDeltaEvent,
  TextGeneratedEvent,
} from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";

const metadata = {
  clientId: "noop" as const,
  modelId: "noop" as const,
};

const textDelta1: TextDeltaEvent = {
  type: "text_delta",
  content: {
    delta: "Soup",
  },
  metadata,
};

const textDelta2: TextDeltaEvent = {
  type: "text_delta",
  content: {
    delta: "inou!",
  },
  metadata,
};

const textEvent: TextGeneratedEvent = {
  type: "text_generated",
  content: {
    text: "Soupinou!",
  },
  metadata,
};

// NoopLLM is a dummy LLM that simply returns "Soupinou!".
export class NoopLLM extends LLM {
  constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
    }: LLMParameters & { modelId: "noop" }
  ) {
    super(auth, {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
      clientId: "noop",
    });
  }

  async *internalStream({
    conversation: _conversation,
    prompt: _prompt,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    // Emit a simple flow of event:
    // 1. text delta "Soup"
    // 2. text delta "inou!"
    // 3. text generated "Soupinou!"
    // 4. success event with aggregated text "Soupinou!"

    yield textDelta1;
    yield textDelta2;
    yield textEvent;
    yield {
      type: "success",
      aggregated: [textEvent],
      textGenerated: textEvent,
      metadata,
    };
  }
}
