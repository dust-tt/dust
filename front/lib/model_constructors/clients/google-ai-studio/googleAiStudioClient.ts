import { LargeLanguageModel } from "@app/lib/model_constructors/large-language-model";
import { inputConfigSchema } from "@app/lib/model_constructors/types/config";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ErrorEvent } from "@app/lib/model_constructors/types/events";
import type { BaseConversation } from "@app/lib/model_constructors/types/messages";
import type {
  GOOGLE_AI_STUDIO_PROVIDER_ID,
  Model,
} from "@app/lib/model_constructors/types/providers";
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
} from "@google/genai";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";

export type GoogleAiStudioModel = Extract<
  Model,
  { providerId: typeof GOOGLE_AI_STUDIO_PROVIDER_ID }
>;

export const GOOGLE_AI_STUDIO_SUPPORTED_NON_NULL_REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
] as const;

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        ...GOOGLE_AI_STUDIO_SUPPORTED_NON_NULL_REASONING_EFFORTS,
        "none",
      ]),
    })
    .optional(),
});

export type GoogleAiStudioRequestPayload = {
  model: string;
  conversation: BaseConversation;
  generationConfig: GenerateContentConfig;
};

// Detects "API key not valid" responses that Google returns with HTTP 400.
function isGoogleAuthenticationErrorMessage(message: string): boolean {
  return message.toLowerCase().includes("api key not valid");
}

export abstract class GoogleAiStudio extends LargeLanguageModel<
  GoogleAiStudioRequestPayload,
  GenerateContentResponse
> {
  abstract model: GoogleAiStudioModel;
  client: GoogleGenAI;
  configSchema: z.ZodType<z.infer<typeof configSchema>> = configSchema;
  byok = true;

  constructor(credentials: Credentials) {
    super(credentials);
    this.client = new GoogleGenAI({
      apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
    });
  }

  abstract conversationToContents(
    conversation: BaseConversation
  ): Promise<Content[]>;

  streamErrorToEvent(error: unknown): ErrorEvent {
    if (error instanceof ApiError) {
      const status = error.status;

      if (
        status === 401 ||
        (status === 400 && isGoogleAuthenticationErrorMessage(error.message))
      ) {
        return {
          type: "error",
          content: {
            type: "authentication_error",
            message: `Authentication failed for Google AI Studio: ${error.message}`,
            originalError: error,
          },
          metadata: this.model,
        };
      }

      switch (status) {
        case 400:
          return {
            type: "error",
            content: {
              type: "invalid_request_error",
              message: `Invalid request to Google AI Studio: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 403:
          return {
            type: "error",
            content: {
              type: "permission_error",
              message: `Permission denied for Google AI Studio: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 404:
          return {
            type: "error",
            content: {
              type: "not_found_error",
              message: `Resource not found for Google AI Studio: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 429:
          return {
            type: "error",
            content: {
              type: "rate_limit_error",
              message: `Rate limit exceeded for Google AI Studio/${this.model.modelId}: ${error.message}`,
              originalError: error,
            },
            metadata: this.model,
          };
        case 503:
          return {
            type: "error",
            content: {
              type: "overloaded_error",
              message: `Google AI Studio is overloaded: ${error.message}`,
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
                message: `Server error from Google AI Studio (${status}): ${error.message}`,
                originalError: error,
              },
              metadata: this.model,
            };
          }
          return {
            type: "error",
            content: {
              type: "unknown_error",
              message: `Error from Google AI Studio (${status}): ${error.message}`,
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
        message: `Unknown error from Google AI Studio`,
        originalError: error,
      },
      metadata: this.model,
    };
  }

  async *streamRaw(
    input: GoogleAiStudioRequestPayload
  ): AsyncGenerator<GenerateContentResponse> {
    const contents = await this.conversationToContents(input.conversation);

    const stream = await this.client.models.generateContentStream({
      model: input.model,
      contents,
      config: input.generationConfig,
    });

    yield* stream;
  }
}
