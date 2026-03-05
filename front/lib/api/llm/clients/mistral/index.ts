import type { MistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import { MISTRAL_PROVIDER_ID } from "@app/lib/api/llm/clients/mistral/types";
import { toToolChoiceParam } from "@app/lib/api/llm/clients/mistral/utils";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/mistral/utils/conversation_to_mistral";
import { handleError } from "@app/lib/api/llm/clients/mistral/utils/errors";
import { streamLLMEvents } from "@app/lib/api/llm/clients/mistral/utils/mistral_to_events";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { Mistral } from "@mistralai/mistralai";
import { MistralError } from "@mistralai/mistralai/models/errors/mistralerror";

/**
 * Extract the request type from Mistral SDK's chat.stream method.
 * This infers the type directly from the SDK's actual method signature
 * rather than manually duplicating the interface.
 */
type MistralChatStreamRequest = Parameters<Mistral["chat"]["stream"]>[0];

export class MistralLLM extends LLM<MistralChatStreamRequest> {
  private client: Mistral;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: MistralWhitelistedModelId }
  ) {
    super(auth, MISTRAL_PROVIDER_ID, llmParameters);

    const { MISTRAL_API_KEY } = dustManagedCredentials();
    if (!MISTRAL_API_KEY) {
      throw new Error(
        "DUST_MANAGED_MISTRAL_API_KEY environment variable is required"
      );
    }
    this.client = new Mistral({
      apiKey: MISTRAL_API_KEY,
    });
  }

  protected buildRequestPayload({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): MistralChatStreamRequest {
    const messages = [
      {
        role: "system" as const,
        content: systemPromptToText(prompt),
      },
      ...conversation.messages.map(toMessage),
    ];

    return {
      model: this.modelId,
      messages,
      temperature: this.temperature ?? undefined,
      stream: true,
      toolChoice: toToolChoiceParam(specifications, forceToolCall),
      tools: specifications.map(toTool),
    };
  }

  protected async *sendRequest(
    payload: MistralChatStreamRequest
  ): AsyncGenerator<LLMEvent> {
    try {
      const completionEvents = await this.client.chat.stream(payload);

      yield* streamLLMEvents({
        completionEvents,
        metadata: this.metadata,
      });
    } catch (err) {
      if (err instanceof MistralError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
