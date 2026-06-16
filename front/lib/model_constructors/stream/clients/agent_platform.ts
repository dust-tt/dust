import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { WithAnthropicInputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/input";
import { WithAnthropicOutputConverter } from "@app/lib/model_constructors/providers/anthropic/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/anthropic/converters/output/utils";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { AGENT_PLATFORM_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";

import { z } from "zod";

// Can be extended later (e.g. "us", "asia-east1"...)
type AgentPlatformRegionalEndpoint = "global" | "europe-west1";

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        ...ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
        "none",
      ]),
    })
    .optional(),
});

export abstract class AgentPlatformStream extends WithAnthropicInputConverter(
  WithAnthropicOutputConverter(
    StreamEndpoint<MessageCreateParamsNonStreaming, RawMessageStreamEvent>
  )
) {
  // Narrow `this.constructor` so the per-endpoint static below is visible.
  declare ["constructor"]: BaseEndpointConfiguration & {
    regionalEndpoint: AgentPlatformRegionalEndpoint;
  };

  static readonly providerId = ANTHROPIC_PROVIDER_ID;
  static readonly api = AGENT_PLATFORM_API;

  static readonly configSchema: z.ZodType<z.infer<typeof configSchema>> =
    configSchema;

  private readonly client: AnthropicVertex;

  constructor({ AGENT_PLATFORM_PROJECT_ID }: Credentials) {
    super();
    this.client = new AnthropicVertex({
      region: this.constructor.regionalEndpoint,
      projectId: AGENT_PLATFORM_PROJECT_ID,
    });
  }

  async *streamRaw(
    input: MessageCreateParamsNonStreaming
  ): AsyncGenerator<RawMessageStreamEvent> {
    const streamingInput: MessageCreateParamsStreaming = {
      ...input,
      stream: true,
    };
    const stream = this.client.messages.stream(streamingInput);

    // SDK mutates/reuses events; deep-copy.
    for await (const event of stream) {
      yield structuredClone(event);
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<RawMessageStreamEvent>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
