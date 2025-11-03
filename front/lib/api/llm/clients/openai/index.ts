import { OpenAI } from "openai";
import type { ReasoningEffort as OpenAiReasoningEffort } from "openai/resources/shared";

import type { OpenAIResponsesWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import {
  isOpenAIResponsesWhitelistedReasoningModelId,
  REASONING_EFFORT_TO_OPENAI_REASONING,
} from "@app/lib/api/llm/clients/openai/types";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import {
  toInput,
  toTool,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

export class OpenAIResponsesLLM extends LLM {
  private client: OpenAI;

  private readonly reasoning: {
    effort: OpenAiReasoningEffort;
    summary: "auto";
  } | null;

  constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
    }: LLMParameters & { modelId: OpenAIResponsesWhitelistedModelId }
  ) {
    super(auth, {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
      clientId: "openai_responses",
    });

    // OpenAI throws an error if reasoning is set for non reasoning models
    // TODO(LLM-Router 2025-10-28): handle o3 models differently : temperature should be set to 0
    // TODO(LLM-Router 2025-10-28): handle GPT-5 models differently : temperature not supported
    this.reasoning =
      isOpenAIResponsesWhitelistedReasoningModelId(modelId) &&
      this.reasoningEffort
        ? {
            effort: REASONING_EFFORT_TO_OPENAI_REASONING[this.reasoningEffort],
            summary: "auto",
          }
        : null;

    const { OPENAI_API_KEY, OPENAI_BASE_URL } = dustManagedCredentials();
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    const events = await this.client.responses.create({
      model: this.modelId,
      input: toInput(prompt, conversation),
      stream: true,
      temperature: this.temperature,
      reasoning: this.reasoning,
      tools: specifications.map(toTool),
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
