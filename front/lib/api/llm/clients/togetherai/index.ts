import type { TogetheraiWhitelistedModelId } from "@app/lib/api/llm/clients/togetherai/types";
import {
  overwriteLLMParameters,
  TOGETHERAI_PROVIDER_ID,
} from "@app/lib/api/llm/clients/togetherai/types";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
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
import assert from "assert";
import { APIError, OpenAI } from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

export class TogetheraiLLM extends LLM<ChatCompletionCreateParamsStreaming> {
  private client: OpenAI;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & {
      modelId: TogetheraiWhitelistedModelId;
    }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, TOGETHERAI_PROVIDER_ID, params);

    const { TOGETHERAI_API_KEY } = llmParameters.credentials;
    assert(TOGETHERAI_API_KEY, "TOGETHERAI_API_KEY credential is required");
    this.client = new OpenAI({
      apiKey: TOGETHERAI_API_KEY,
      baseURL: "https://api.together.xyz/v1",
    });
  }

  protected buildStreamRequestPayload({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): ChatCompletionCreateParamsStreaming {
    const tools =
      specifications.length > 0 ? toTools(specifications) : undefined;

    return {
      model: this.modelId,
      messages: toMessages(systemPromptToText(prompt), conversation),
      stream: true,
      stream_options: {
        include_usage: true,
      },
      temperature: this.temperature ?? undefined,
      reasoning_effort: toReasoningParam(
        this.reasoningEffort,
        this.modelConfig.useNativeLightReasoning
      ),
      tool_choice: toToolChoiceParam(specifications, forceToolCall),
      ...(tools ? { tools } : {}),
      response_format: toOutputFormatParam(this.responseFormat),
    };
  }

  protected async *sendRequest(
    payload: ChatCompletionCreateParamsStreaming
  ): AsyncGenerator<LLMEvent> {
    try {
      const events = await this.client.chat.completions.create(payload);
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
