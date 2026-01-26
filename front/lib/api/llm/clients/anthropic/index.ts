import Anthropic, { APIError } from "@anthropic-ai/sdk";

import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import {
  ANTHROPIC_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/anthropic/types";
import {
  toOutputFormatParam,
  toThinkingConfig,
  toToolChoiceParam,
} from "@app/lib/api/llm/clients/anthropic/utils";
import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { handleError } from "@app/lib/api/llm/clients/anthropic/utils/errors";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types";

export class AnthropicLLM extends LLM {
  private client: Anthropic;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: AnthropicWhitelistedModelId }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, ANTHROPIC_PROVIDER_ID, params);
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "DUST_MANAGED_ANTHROPIC_API_KEY environment variable is required"
      );
    }

    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const messages = conversation.messages.map((msg, index, array) =>
        toMessage(msg, { isLast: index === array.length - 1 })
      );

      logger.info(
        {
          modelId: this.modelId,
          messageCount: messages.length,
          toolCount: specifications.length,
          conversationId: this.context?.conversationId,
          traceId: this.traceId,
        },
        "[AGENT_LOOP_DEBUG] Anthropic internalStream creating stream"
      );

      const events = this.client.beta.messages.stream({
        model: this.modelId,
        thinking: toThinkingConfig(
          this.reasoningEffort,
          this.modelConfig.useNativeLightReasoning
        ),
        system: [
          {
            type: "text",
            text: prompt,
            cache_control: {
              type: "ephemeral",
            },
          },
        ],
        messages,
        temperature: this.temperature ?? undefined,
        stream: true,
        tools: specifications.map(toTool),
        max_tokens: this.modelConfig.generationTokensCount,
        tool_choice: toToolChoiceParam(specifications, forceToolCall),
        // Structured output
        // TODO(fabien): Remove beta tag and beta client when structured outputs are generally available
        betas: ["structured-outputs-2025-11-13"],
        output_format: toOutputFormatParam(this.responseFormat),
      });

      logger.info(
        {
          modelId: this.modelId,
          conversationId: this.context?.conversationId,
          traceId: this.traceId,
        },
        "[AGENT_LOOP_DEBUG] Anthropic stream object created, starting iteration"
      );

      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      logger.error(
        {
          modelId: this.modelId,
          error: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : "unknown",
          conversationId: this.context?.conversationId,
          traceId: this.traceId,
        },
        "[AGENT_LOOP_DEBUG] Anthropic internalStream caught error"
      );
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
