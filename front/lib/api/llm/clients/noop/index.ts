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
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { isTextContent } from "@app/types/assistant/generation";

const STATIC_RESPONSE_REGEX = /<static_response>([\s\S]*?)<\/static_response>/;

const metadata = {
  clientId: "noop" as const,
  modelId: "noop" as const,
};

interface NoopRequest {
  type: "noop_request";
  lastUserMessage: string;
  staticResponse?: string;
}

// NoopLLM is a dummy LLM that can respond to special commands.
export class NoopLLM extends LLM<NoopRequest> {
  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: "noop" }
  ) {
    super(auth, "noop", llmParameters);
  }

  protected buildRequestPayload({
    conversation,
    prompt,
  }: LLMStreamParameters): NoopRequest {
    // Check for a static response embedded in the system prompt.
    const promptText = systemPromptToText(prompt);
    const staticMatch = promptText.match(STATIC_RESPONSE_REGEX);
    if (staticMatch) {
      return {
        type: "noop_request",
        lastUserMessage: "",
        staticResponse: staticMatch[1].trim(),
      };
    }

    const lastUserMessage =
      conversation.messages
        .slice()
        .reverse()
        .find((msg) => msg.role === "user")
        ?.content.filter(isTextContent)
        .map((item) => item.text)
        .join("\n")
        .split("@noop")[1]
        ?.trim() ?? "";

    return { type: "noop_request", lastUserMessage };
  }

  protected async *sendRequest(payload: NoopRequest): AsyncGenerator<LLMEvent> {
    let responseText: string;

    // Determine response based on the message content.
    if (payload.staticResponse) {
      responseText = payload.staticResponse;
    } else if (payload.lastUserMessage === "long message") {
      // Generate a very long message.
      responseText = "This is a very long message. ".repeat(100);
    } else if (payload.lastUserMessage === "help") {
      // Display usage instructions.
      responseText =
        "Noop agent usage:\n" +
        "- Send 'long message' to receive a very long response\n" +
        "- Send 'help' to see this help message\n" +
        "- Send anything else to see 'Soupinou!' as a response\n";
    } else {
      responseText = "Soupinou!";
    }

    // Emit text deltas in chunks.
    const chunkSize = 50;
    for (let i = 0; i < responseText.length; i += chunkSize) {
      const delta = responseText.slice(i, i + chunkSize);
      const textDelta: TextDeltaEvent = {
        type: "text_delta",
        content: { delta },
        metadata,
      };
      yield textDelta;
    }

    // Emit the full text generated event.
    const textEvent: TextGeneratedEvent = {
      type: "text_generated",
      content: { text: responseText },
      metadata,
    };
    yield textEvent;

    // Emit success event.
    yield {
      type: "success",
      aggregated: [textEvent],
      textGenerated: textEvent,
      metadata,
    };
  }
}
