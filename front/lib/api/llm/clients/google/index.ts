import { ApiError, GoogleGenAI } from "@google/genai";

import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import {
  toContent,
  toTool,
} from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import { streamLLMEvents } from "@app/lib/api/llm/clients/google/utils/google_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

import { handleError } from "./utils/errors";

export class GoogleLLM extends LLM {
  private client: GoogleGenAI;

  constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
    }: LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId }
  ) {
    super(auth, {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
      clientId: "google_ai_studio",
    });
    const { GOOGLE_AI_STUDIO_API_KEY } = dustManagedCredentials();
    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        "GOOGLE_AI_STUDIO_API_KEY environment variable is required"
      );
    }
    // as far as I know, there are no retries for google genai
    this.client = new GoogleGenAI({
      apiKey: GOOGLE_AI_STUDIO_API_KEY,
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const contents = await Promise.all(conversation.messages.map(toContent));
      const generateContentResponses =
        await this.client.models.generateContentStream({
          model: this.modelId,
          contents,
          config: {
            temperature: this.temperature,
            tools: specifications.map(toTool),
            systemInstruction: { text: prompt },
            // We only need one
            candidateCount: 1,
            thinkingConfig: {
              includeThoughts: true,
              // TODO(LLM-Router 2025-10-27): update according to effort
              thinkingBudget: 1024,
            },
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
