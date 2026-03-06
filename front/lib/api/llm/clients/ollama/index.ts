import {
  OLLAMA_MODEL_CONFIGS,
  OLLAMA_PROVIDER_ID,
  type OllamaWhitelistedModelId,
} from "@app/lib/api/llm/clients/ollama/types";
import {
  toOllamaMessage,
  toOllamaTool,
} from "@app/lib/api/llm/clients/ollama/utils/conversation_to_ollama";
import { streamLLMEvents } from "@app/lib/api/llm/clients/ollama/utils/ollama_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type { ChatRequest } from "ollama";
import { Ollama } from "ollama";

export class OllamaLLM extends LLM<ChatRequest> {
  private client: Ollama;
  protected modelId: OllamaWhitelistedModelId;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: OllamaWhitelistedModelId }
  ) {
    super(auth, OLLAMA_PROVIDER_ID, llmParameters);
    this.modelId = llmParameters.modelId;

    this.client = new Ollama();
  }

  protected buildRequestPayload({
    conversation,
    prompt,
    specifications,
  }: LLMStreamParameters): ChatRequest {
    const systemMessage = systemPromptToText(prompt);
    const messages = [
      ...(systemMessage ? [{ role: "system", content: systemMessage }] : []),
      ...conversation.messages.map(toOllamaMessage),
    ];

    return {
      model: this.modelId,
      messages,
      tools:
        specifications.length > 0
          ? specifications.map(toOllamaTool)
          : undefined,
      options: {
        temperature: this.temperature ?? undefined,
      },
      think:
        OLLAMA_MODEL_CONFIGS[this.modelId].thinkingConfig[
          this.reasoningEffort ?? "none"
        ],
      format: this.responseFormat ? "json" : undefined,
    };
  }

  protected async *sendRequest(payload: ChatRequest): AsyncGenerator<LLMEvent> {
    try {
      const response = await this.client.chat({
        ...payload,
        stream: true,
      });

      yield* streamLLMEvents({
        response,
        metadata: this.metadata,
      });
    } catch (err) {
      yield handleGenericError(err, this.metadata);
    }
  }
}
