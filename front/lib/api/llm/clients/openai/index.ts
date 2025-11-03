import { OpenAI } from "openai";

import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { overwriteLLMParameters } from "@app/lib/api/llm/clients/openai/types";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import {
  toInput,
  toReasoning,
  toTool,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/responses/openai_to_events";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

export class OpenAIResponsesLLM extends LLM {
  private client: OpenAI;
  private metadata: LLMClientMetadata = {
    clientId: "openai_responses",
    modelId: this.modelId,
  };

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: OpenAIWhitelistedModelId }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));

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
      reasoning: toReasoning(this.reasoningEffort),
      tools: specifications.map(toTool),
    });

    yield* streamLLMEvents(events, this.metadata);
  }
}
