import { ApiError, GoogleGenAI } from "@google/genai";

import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import {
  toContent,
  toTool,
} from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import { streamLLMEvents } from "@app/lib/api/llm/clients/google/utils/google_to_events";
import { toThinkingConfig } from "@app/lib/api/llm/clients/google/utils/to_thinking";
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

const GOOGLE_AI_STUDIO_PROVIDER_ID = "google_ai_studio";

export class GoogleLLM extends LLM {
  private client: GoogleGenAI;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: GoogleAIStudioWhitelistedModelId }
  ) {
    super(auth, { ...llmParameters, clientId: GOOGLE_AI_STUDIO_PROVIDER_ID });
    const { GOOGLE_AI_STUDIO_API_KEY } = dustManagedCredentials();
    if (!GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        "GOOGLE_AI_STUDIO_API_KEY environment variable is required"
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
            thinkingConfig: toThinkingConfig(
              this.reasoningEffort,
              this.modelConfig.useNativeLightReasoning
            ),
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
