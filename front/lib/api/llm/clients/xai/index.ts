import OpenAI, { APIError } from "openai";
import type { ReasoningEffort as OpenAiReasoningEffort } from "openai/resources/shared";

import {
  isOpenAIResponsesWhitelistedReasoningModelId,
  REASONING_EFFORT_TO_OPENAI_REASONING,
} from "@app/lib/api/llm/clients/openai/types";
import type { XaiWhitelistedModelId } from "@app/lib/api/llm/clients/xai/types";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import {
  toInput,
  toTool,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

export class XaiLLM extends LLM {
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
      modelId: XaiWhitelistedModelId;
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

    const { XAI_API_KEY } = dustManagedCredentials();
    if (!XAI_API_KEY) {
      throw new Error("XAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
      // We want to handle the retries ourselves
      maxRetries: 0,
    });
  }

  protected async *internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const events = await this.client.responses.create({
        model: this.modelId,
        input: toInput(prompt, conversation, "system"),
        stream: true,
        temperature: this.temperature,
        reasoning: this.reasoning,
        tools: specifications.map(toTool),
      });

      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
