import { GoogleGenAI } from "@google/genai";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import {
  toContent,
  toTool,
} from "@app/lib/api/llm/clients/google/utils/conversation_to_google";
import { streamLLMEvents } from "@app/lib/api/llm/clients/google/utils/google_to_events";
import type { LLMWithTracingParameters } from "@app/lib/api/llm/llm";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type { ModelConversationTypeMultiActions } from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class GoogleLLM extends LLM {
  private client: GoogleGenAI;
  private metadata: LLMClientMetadata = {
    clientId: "google_ai_studio",
    modelId: this.modelId,
  };
  constructor(
    auth: Authenticator,
    {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
    }: LLMWithTracingParameters & { modelId: GoogleAIStudioWhitelistedModelId }
  ) {
    super(auth, {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
    });
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

  async *stream({
    conversation,
    prompt,
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent> {
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
  }
}
