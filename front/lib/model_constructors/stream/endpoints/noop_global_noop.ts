import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { NOOP_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import type {
  ModelResponseEvent,
  TextEvent,
} from "@app/lib/model_constructors/types/output/events";
import { NOOP_API } from "@app/lib/model_constructors/types/provider_apis";
import { NOOP_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

// Resolved request for the noop endpoint. `staticResponse` is not present in the
// conversation payload; the noop transition injects it from the model metadata.
export type NoopRequest = {
  lastUserMessageContent: string;
  staticResponse?: string;
};

// Mirrors the legacy `NoopLLM` command handling. `consume $X` is handled at the
// transition layer (it records simulated run usage); here it simply falls
// through to the default reply.
function resolveNoopResponse({
  lastUserMessageContent,
  staticResponse,
}: NoopRequest): string {
  if (staticResponse) {
    return staticResponse;
  }

  const command = lastUserMessageContent
    .replace(/<dust_system>[\s\S]*?<\/dust_system>/g, "")
    .trim();

  if (command === "long message") {
    return "This is a very long message. ".repeat(100);
  }

  if (command === "help") {
    return (
      "Noop agent usage:\n" +
      "- Send 'long message' to receive a very long response\n" +
      "- Send 'consume $X' to simulate X dollars of credit cost\n" +
      "- Send 'help' to see this help message\n" +
      "- Send anything else to see 'Soupinou!' as a response\n"
    );
  }

  return "Soupinou!";
}

// The noop endpoint has no external API: it synthesizes a text stream in
// process. It is a real new-router citizen so the legacy router can be retired.
export class NoopGlobalNoopStream extends StreamEndpoint<
  NoopRequest,
  string,
  InputConfig
> {
  static readonly providerId = NOOP_PROVIDER_ID;
  static readonly api = NOOP_API;
  static readonly modelId = NOOP_MODEL_ID;
  static readonly region = GLOBAL;

  // The noop model ignores every config knob; accept the widest input.
  static readonly configSchema = inputConfigSchema;

  static readonly contextSize = 1_000_000;
  static readonly maxOutputTokens = 64_000;

  // Free: the model never hits a provider. `consume $X` records its own
  // simulated cost via the transition, independently of token pricing.
  static readonly tokenPricing = {
    standardInput: 0,
    standardOutput: 0,
  };

  static readonly id = this.buildId();

  constructor(_credentials: unknown) {
    super();
  }

  buildRequestPayload(payload: Payload): NoopRequest {
    const lastUserMessage = payload.conversation.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user" && msg.type === "text");

    const lastUserMessageContent =
      lastUserMessage?.type === "text"
        ? lastUserMessage.content.value.trim()
        : "";

    return { lastUserMessageContent };
  }

  async *streamRaw(input: NoopRequest): AsyncGenerator<string> {
    const responseText = resolveNoopResponse(input);
    const chunkSize = 50;
    for (let i = 0; i < responseText.length; i += chunkSize) {
      yield responseText.slice(i, i + chunkSize);
    }
  }

  async *rawStreamOutputToEvents(
    raw: AsyncGenerator<string>
  ): AsyncGenerator<ModelResponseEvent> {
    const metadata = this.metadata();

    let fullText = "";
    for await (const delta of raw) {
      fullText += delta;
      yield { type: "text_delta", content: { value: delta }, metadata };
    }

    const textEvent: TextEvent = {
      type: "text",
      content: { value: fullText },
      metadata,
    };
    yield textEvent;

    yield {
      type: "success",
      content: { aggregated: [textEvent] },
      metadata,
    };
  }
}

NoopGlobalNoopStream satisfies StreamEndpointConstructor;
