import { ApiError, GoogleGenAI } from "@google/genai";

import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import { overwriteLLMParameters } from "@app/lib/api/llm/clients/google/types";
import {
  toContent,
  toTool,
} from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import { streamLLMEvents } from "@app/lib/api/llm/clients/google/utils/google_to_events";
import {
  toResponseSchemaParam,
  toThinkingConfig,
  toToolConfigParam,
} from "@app/lib/api/llm/clients/google/utils/to_thinking";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

import { handleError } from "./utils/errors";

export class GoogleLLM extends LLM {
  private client: GoogleGenAI;
  protected modelId: GoogleAIStudioWhitelistedModelId;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));
    this.modelId = llmParameters.modelId;
    const { GOOGLE_AI_STUDIO_API_KEY } = dustManagedCredentials();
    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        "DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY environment variable is required"
      );
    }

    this.client = new GoogleGenAI({
      apiKey: GOOGLE_AI_STUDIO_API_KEY,
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const contents = await Promise.all(
        conversation.messages.map((message) => toContent(message, this.modelId))
      );
      const generateContentResponses =
        await this.client.models.generateContentStream({
          model: this.modelId,
          contents,
          config: {
            temperature: this.temperature ?? undefined,
            tools: specifications.map(toTool),
            systemInstruction: { text: prompt },
            // We only need one
            candidateCount: 1,
            thinkingConfig: toThinkingConfig({
              modelId: this.modelId,
              reasoningEffort: this.reasoningEffort,
              useNativeLightReasoning: this.modelConfig.useNativeLightReasoning,
            }),
            toolConfig: toToolConfigParam(specifications, forceToolCall),
            // Structured response format
            responseMimeType: this.responseFormat
              ? "application/json"
              : undefined,
            responseSchema: toResponseSchemaParam(this.responseFormat),
          },
        });

      yield* streamLLMEvents({
        generateContentResponses,
        metadata: this.metadata,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
