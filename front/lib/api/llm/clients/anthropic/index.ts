import Anthropic from "@anthropic-ai/sdk";
import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import fs from "fs";
import path from "path";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import { CLAUDE_4_THINKING_BUDGET_TOKENS } from "@app/lib/api/llm/clients/anthropic/utils";
import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
} from "@app/lib/api/llm/types/options";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type {
  ModelConversationTypeMultiActions,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";
import { dustManagedCredentials } from "@app/types";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: LLMClientMetadata = {
    clientId: "anthropic",
    modelId: this.modelId,
  };
  private thinkingConfig?: ThinkingConfigParam;
  private modelConfig: (typeof SUPPORTED_MODEL_CONFIGS)[number];

  constructor({
    modelId,
    temperature,
    reasoningEffort,
    bypassFeatureFlag,
  }: LLMParameters & { modelId: AnthropicWhitelistedModelId }) {
    super({ modelId, temperature, reasoningEffort, bypassFeatureFlag });
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.modelConfig = getSupportedModelConfig({
      modelId: this.modelId,
      providerId: "anthropic",
    });

    if (reasoningEffort) {
      this.thinkingConfig = {
        type: "enabled",
        budget_tokens: CLAUDE_4_THINKING_BUDGET_TOKENS[reasoningEffort],
      };
    }
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async *stream({
    conversation,
    prompt,
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent> {
    const messages = conversation.messages.map(toMessage);

    // DEBUG: Save request messages to JSON file
    const timestamp = Date.now();
    const debugData = {
      timestamp: new Date().toISOString(),
      model: this.modelId,
      temperature: !this.thinkingConfig ? this.temperature : 1,
      thinkingConfig: this.thinkingConfig,
      prompt,
      messages,
      tools: specifications.map(toTool),
    };

    const debugPath = path.join(
      process.cwd(),
      "message",
      `anthropic-messages-${timestamp}.json`
    );
    fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2));

    const events = this.client.messages.stream({
      model: this.modelId,
      thinking: this.thinkingConfig,
      system: prompt,
      messages,
      temperature: !this.thinkingConfig ? this.temperature : 1,
      stream: true,
      tools: specifications.map(toTool),
      max_tokens: this.modelConfig.generationTokensCount,
    });

    // DEBUG: Collect response events for saving
    const responseEvents: LLMEvent[] = [];
    const responsePath = path.join(
      process.cwd(),
      "message",
      `anthropic-response-${timestamp}.json`
    );

    for await (const event of streamLLMEvents(events, this.metadata)) {
      responseEvents.push(event);
      yield event;
    }

    // DEBUG: Save response events to JSON file
    fs.writeFileSync(responsePath, JSON.stringify(responseEvents, null, 2));
  }
}
