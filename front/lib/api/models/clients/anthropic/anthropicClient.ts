import AnthropicClient from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsStreaming,
  MessageParam,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import { inputConfigSchema } from "@app/lib/api/models/types/config";
import type { Credentials } from "@app/lib/api/models/types/credentials";
import type {
  ANTHROPIC_PROVIDER_ID,
  Model,
} from "@app/lib/api/models/types/providers";
import { z } from "zod";

export type AnthropicModel = Extract<
  Model,
  { providerId: typeof ANTHROPIC_PROVIDER_ID }
>;

export const ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "maximal",
] as const;

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

export abstract class Anthropic extends LargeLanguageModel<
  MessageCreateParamsStreaming,
  RawMessageStreamEvent
> {
  abstract model: AnthropicModel;
  client: AnthropicClient;
  configSchema: z.ZodType<z.infer<typeof configSchema>> = configSchema;

  constructor(credentials: Credentials) {
    super(credentials);
    this.client = new AnthropicClient({
      apiKey: credentials.ANTHROPIC_API_KEY,
    });
  }

  async *streamRaw(
    input: MessageCreateParamsStreaming
  ): AsyncGenerator<RawMessageStreamEvent> {
    const stream = this.client.messages.stream(input);

    // The Anthropic SDK reuses and mutates event objects throughout the stream,
    // so we deep-copy each event to prevent downstream consumers from seeing stale data.
    for await (const event of stream) {
      yield structuredClone(event);
    }
  }
}

// Re-export for convenience in model files
export type {
  MessageCreateParamsStreaming,
  MessageParam,
  RawMessageStreamEvent,
};
