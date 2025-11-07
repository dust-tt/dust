import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import { overwriteLLMParameters } from "@app/lib/api/llm/clients/anthropic/types";
import { CLAUDE_4_THINKING_BUDGET_TOKENS } from "@app/lib/api/llm/clients/anthropic/utils";
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
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import type { ReasoningEffort, SUPPORTED_MODEL_CONFIGS } from "@app/types";
import { dustManagedCredentials } from "@app/types";

function toThinkingConfig(
  reasoningEffort: ReasoningEffort | null
): ThinkingConfigParam | undefined {
  if (!reasoningEffort || reasoningEffort === "none") {
    return undefined;
  }
  return {
    type: "enabled",
    budget_tokens: CLAUDE_4_THINKING_BUDGET_TOKENS[reasoningEffort],
  };
}

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private readonly thinkingConfig?: ThinkingConfigParam;
  private modelConfig: (typeof SUPPORTED_MODEL_CONFIGS)[number];

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: AnthropicWhitelistedModelId }
  ) {
    super(auth, overwriteLLMParameters(llmParameters));
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.modelConfig = getSupportedModelConfig({
      modelId: this.modelId,
      providerId: "anthropic",
    });

    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
      // We want to handle the retries ourselves
      maxRetries: 0,
    });
  }

  async *internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    try {
      const messages = conversation.messages.map(toMessage);

      const events = this.client.messages.stream({
        model: this.modelId,
        thinking: toThinkingConfig(this.reasoningEffort),
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
