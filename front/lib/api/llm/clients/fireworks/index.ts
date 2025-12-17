import { APIError, OpenAI } from "openai";

import type { FireworksWhitelistedModelId } from "@app/lib/api/llm/clients/fireworks/types";
import { overwriteLLMParameters } from "@app/lib/api/llm/clients/fireworks/types";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import {
  toMessages,
  toOutputFormatParam,
  toReasoningParam,
  toToolChoiceParam,
  toTools,
} from "@app/lib/api/llm/utils/openai_like/chat/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/chat/openai_to_events";
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

export class FireworksLLM extends LLM {
  private client: OpenAI;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & {
      modelId: FireworksWhitelistedModelId;
    }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));

    const { FIREWORKS_API_KEY } = dustManagedCredentials();
    if (!FIREWORKS_API_KEY) {
      throw new Error(
        "DUST_MANAGED_FIREWORKS_API_KEY environment variable is required"
      );
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
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const tools =
        specifications.length > 0 ? toTools(specifications) : undefined;

      const events = await this.client.chat.completions.create({
        model: this.modelId,
        messages: toMessages(prompt, conversation),
        stream: true,
        temperature: this.temperature ?? undefined,
        reasoning_effort: toReasoningParam(
          this.reasoningEffort,
          this.modelConfig.useNativeLightReasoning
        ),
        tool_choice: toToolChoiceParam(specifications, forceToolCall),
        ...(tools ? { tools } : {}),
        response_format: toOutputFormatParam(this.responseFormat),
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
