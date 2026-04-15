import AnthropicClient, {
  APIConnectionError,
  APIError,
} from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsStreaming,
  MessageParam,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";

import { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import { inputConfigSchema } from "@app/lib/api/models/types/config";
import type { Credentials } from "@app/lib/api/models/types/credentials";
import type { ErrorEvent } from "@app/lib/api/models/types/events";
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

  streamErrorToEvent(error: unknown): ErrorEvent {
    if (error instanceof APIConnectionError) {
      return {
        type: "error",
        content: {
          type: "network_error",
          message: `Network error connecting to Anthropic: ${error.message}`,
          originalError: error,
        },
        metadata: this.model,
      };
    }

    if (error instanceof APIError) {
      const status = error.status;

      switch (status) {
        case 400:
        case 422:
          return {
            type: "error",
            content: {
              type: "invalid_request_error",
              message: `Invalid request to Anthropic: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 401:
          return {
            type: "error",
            content: {
              type: "authentication_error",
              message: `Authentication failed for Anthropic: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 403:
          return {
            type: "error",
            content: {
              type: "permission_error",
              message: `Permission denied for Anthropic: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 404:
          return {
            type: "error",
            content: {
              type: "not_found_error",
              message: `Resource not found for Anthropic: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 429:
          return {
            type: "error",
            content: {
              type: "rate_limit_error",
              message: `Rate limit exceeded for Anthropic/${this.model.modelId}: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 503:
          return {
            type: "error",
            content: {
              type: "overloaded_error",
              message: `Anthropic is overloaded: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        default:
          if (status >= 500 && status < 600) {
            return {
              type: "error",
              content: {
                type: "server_error",
                message: `Server error from Anthropic (${status}): ${error.message}`,
                originalError: error,
              },
              metadata: this.model,
            };
          }

          return {
            type: "error",
            content: {
              type: "unknown_error",
              message: `Error from Anthropic (${status}): ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
      }
    }

    return {
      type: "error",
      content: {
        type: "unknown_error",
        message: `Unknown error from Anthropic`,
        originalError: error,
      },
      metadata: this.model,
    };
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
