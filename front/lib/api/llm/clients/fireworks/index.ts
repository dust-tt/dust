import { APIError, OpenAI } from "openai";

import type { FireworksWhitelistedModelId } from "@app/lib/api/llm/clients/fireworks/types";
import { overwriteLLMParameters } from "@app/lib/api/llm/clients/fireworks/types";
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
  toReasoning,
  toTool,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
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
    try {
      const events = await this.client.responses.create({
        model: this.modelId,
        input: toInput(prompt, conversation),
        stream: true,
        temperature: this.temperature,
        reasoning: toReasoning(this.reasoningEffort),
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
