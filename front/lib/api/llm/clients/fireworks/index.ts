import { OpenAI } from "openai";
import type { ReasoningEffort as OpenAiReasoningEffort } from "openai/resources/shared";

import type { FireworksWhitelistedModelId } from "@app/lib/api/llm/clients/fireworks/types";
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

export class FireworksLLM extends LLM {
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
    }: LLMParameters & {
      modelId: FireworksWhitelistedModelId;
    }
  ) {
    super(auth, {
      bypassFeatureFlag,
      context,
      modelId,
      reasoningEffort,
      temperature,
      clientId: "openai_responses",
    });

    this.reasoning = isOpenAIResponsesWhitelistedReasoningModelId(modelId)
      ? {
          effort: REASONING_EFFORT_TO_OPENAI_REASONING[this.reasoningEffort],
          summary: "auto",
        }
      : null;

    const { FIREWORKS_API_KEY } = dustManagedCredentials();
    if (!FIREWORKS_API_KEY) {
      throw new Error("FIREWORKS_API_KEY environment variable is required");
    }
    this.client = new OpenAI({
      apiKey: FIREWORKS_API_KEY,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });
  }

  protected async *internalStream({
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
