import OpenAI, { APIError } from "openai";

import type { XaiWhitelistedModelId } from "@app/lib/api/llm/clients/xai/types";
import { overwriteLLMParameters } from "@app/lib/api/llm/clients/xai/types";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import {
  toInput,
  toTool,
  toToolOption,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

export class XaiLLM extends LLM {
  private client: OpenAI;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & {
      modelId: XaiWhitelistedModelId;
    }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));

    const { XAI_API_KEY } = dustManagedCredentials();
    if (!XAI_API_KEY) {
      throw new Error(
        "DUST_MANAGED_XAI_API_KEY environment variable is required"
      );
    }
    this.client = new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }

  protected async *internalStream({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const events = await this.client.responses.create({
        model: this.modelId,
        input: toInput(prompt, conversation, "system"),
        stream: true,
        // Reasoning not supported by xai responses api yet
        // Using default value for reasoning models
        temperature: this.temperature,
        tools: specifications.map(toTool),
        include: ["reasoning.encrypted_content"],
        tool_choice: toToolOption(specifications, forceToolCall),
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
