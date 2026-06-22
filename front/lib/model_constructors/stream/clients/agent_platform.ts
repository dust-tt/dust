import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  Model,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { WithAnthropicAIInputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input";
import { WithAnthropicAIOutputConverter } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import {
  CLAUDE_HAIKU_4_5_MODEL_ID,
  type ModelId,
} from "@app/lib/model_constructors/types/model_ids";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { AGENT_PLATFORM_API } from "@app/lib/model_constructors/types/provider_apis";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";

import { z } from "zod";

// Can be extended later (e.g. "us", "asia-east1"...)
export type AgentPlatformRegionalEndpoint = "global" | "eu";

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

const MODEL_MAPPING: Partial<Record<ModelId, Model>> = {
  [CLAUDE_HAIKU_4_5_MODEL_ID]: "claude-haiku-4-5@20251001",
};

export abstract class AgentPlatformStream extends WithAnthropicAIInputConverter(
  WithAnthropicAIOutputConverter(
    StreamEndpoint<
      MessageCreateParamsNonStreaming,
      RawMessageStreamEvent,
      AnthropicInputConfig
    >
  )
) {
  // Narrow `this.constructor` so the per-endpoint static below is visible.
  declare ["constructor"]: BaseEndpointConfiguration<AnthropicInputConfig> & {
    regionalEndpoint: AgentPlatformRegionalEndpoint;
  };

  static readonly providerId = ANTHROPIC_PROVIDER_ID;
  static readonly api = AGENT_PLATFORM_API;

  static readonly regionalEndpoint: AgentPlatformRegionalEndpoint;

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

  modelIdToApiModelId = (modelId: ModelId): Model =>
    MODEL_MAPPING[modelId] ?? modelId;

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
