import { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import type { Credentials } from "@app/lib/api/models/types/credentials";
import type { ErrorEvent } from "@app/lib/api/models/types/events";
import type {
  Model,
  OPENAI_PROVIDER_ID,
} from "@app/lib/api/models/types/providers";
import OpenAI, { APIConnectionError, APIError } from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

export type OpenAiModel = Extract<
  Model,
  { providerId: typeof OPENAI_PROVIDER_ID }
>;

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export abstract class OpenAiResponses extends LargeLanguageModel<
  ResponseCreateParamsStreaming,
  ResponseStreamEvent
> {
  abstract model: OpenAiModel;
  client: OpenAI;

  constructor(credentials: Credentials) {
    super(credentials);
    this.client = new OpenAI({
      apiKey: credentials.OPENAI_API_KEY,
      baseURL: credentials.OPENAI_BASE_URL ?? OPENAI_API_BASE_URL,
      defaultHeaders: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
    });
  }

  streamErrorToEvent(error: unknown): ErrorEvent {
    if (error instanceof APIConnectionError) {
      return {
        type: "error",
        content: {
          type: "network_error",
          message: `Network error connecting to OpenAI: ${error.message}`,
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
              message: `Invalid request to OpenAI: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 401:
          return {
            type: "error",
            content: {
              type: "authentication_error",
              message: `Authentication failed for OpenAI: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 403:
          return {
            type: "error",
            content: {
              type: "permission_error",
              message: `Permission denied for OpenAI: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 404:
          return {
            type: "error",
            content: {
              type: "not_found_error",
              message: `Resource not found for OpenAI: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 429:
          return {
            type: "error",
            content: {
              type: "rate_limit_error",
              message: `Rate limit exceeded for OpenAI/${this.model.modelId}: ${error.message}`,
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
                message: `Server error from OpenAI (${status}): ${error.message}`,
                originalError: error,
              },
              metadata: this.model,
            };
          }

          return {
            type: "error",
            content: {
              type: "unknown_error",
              message: `Error from OpenAI (${status}): ${error.message}`,
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
        message: `Unknown error from OpenAI`,
        originalError: error,
      },
      metadata: this.model,
    };
  }

  async *streamRaw(
    input: ResponseCreateParamsStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    yield* await this.client.responses.create(input);
  }
}
