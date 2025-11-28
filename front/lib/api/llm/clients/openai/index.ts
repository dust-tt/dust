import { APIError, OpenAI } from "openai";

import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import {
  OPENAI_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/openai/types";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import {
  toInput,
  toReasoning,
  toResponseFormat,
  toTool,
  toToolOption,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

import { handleGenericError } from "../../types/errors";

export class OpenAIResponsesLLM extends LLM {
  private client: OpenAI;
  protected modelId: OpenAIWhitelistedModelId;
  protected metadata: LLMClientMetadata = {
    clientId: "openai_responses",
    modelId: this.modelId,
  };

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: OpenAIWhitelistedModelId }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));
    this.modelId = llmParameters.modelId;

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
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const reasoning = toReasoning(this.modelId, this.reasoningEffort);
      const events = await this.client.responses.create({
        model: this.modelId,
        input: toInput(prompt, conversation),
        stream: true,
        temperature: this.temperature ?? undefined,
        reasoning,
        tools: specifications.map(toTool),
        text: {
          format: toResponseFormat(this.responseFormat, OPENAI_PROVIDER_ID),
        },
        // Only models supporting reasoning can do encrypted content for reasoning.
        include: reasoning !== null ? ["reasoning.encrypted_content"] : [],
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
