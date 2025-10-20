import { Mistral } from "@mistralai/mistralai";
import * as fs from "fs";
import * as path from "path";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { LLM } from "@app/lib/llm/llm";
import {
  toMessage,
  toTool,
} from "@app/lib/llm/providers/mistral/utils/conversation_to_mistral";
import { toEvents } from "@app/lib/llm/providers/mistral/utils/mistral_to_events";
import type { LLMEvent, ProviderMetadata } from "@app/lib/llm/types/events";
import type { LLMOptions } from "@app/lib/llm/types/options";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

export class MistralLLM extends LLM {
  private client: Mistral;
  private metadata: ProviderMetadata = {
    providerId: "mistral",
    modelId: this.model.modelId,
  };
  private textAccumulator = "";
  protected temperature: number;
  constructor({
    model,
    options: _options,
  }: {
    model: ModelConfigurationType;
    options?: LLMOptions;
  }) {
    super(model);
    this.temperature = 0.7;
    this.client = new Mistral({
      apiKey: process.env.DUST_MANAGED_MISTRAL_API_KEY,
    });
  }

  private resetTextAccumulator() {
    this.textAccumulator = "";
  }
  private appendToTextAccumulator(text: string) {
    this.textAccumulator += text;
  }
  private getTextAccumulator() {
    return this.textAccumulator;
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
    this.resetTextAccumulator();

    // Write input data to log files
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const timestampDir = path.join(__dirname, "logs", timestamp);

    // Ensure the timestamp directory exists
    if (!fs.existsSync(timestampDir)) {
      fs.mkdirSync(timestampDir, { recursive: true });
    }

    const inputLogPath = path.join(timestampDir, "2_input.json");
    const conversationInputLogPath = path.join(
      timestampDir,
      "1_conversation_input.json"
    );

    const messages = [
      {
        role: "system" as const,
        content: prompt,
      },
      ...conversation.messages.map(toMessage),
    ];

    const rawInput = {
      model: this.model.modelId,
      messages,
      temperature: this.temperature,
      stream: true,
      toolChoice: "auto" as const,
      tools: specifications.map(toTool),
    };

    fs.writeFileSync(inputLogPath, JSON.stringify(rawInput, null, 2));
    fs.writeFileSync(
      conversationInputLogPath,
      JSON.stringify(conversation.messages, null, 2)
    );

    const events = await this.client.chat.stream(rawInput);

    const mistralEvents = [];
    const llmMistralEvents = [];

    for await (const event of events) {
      mistralEvents.push(event);
      const llmEvents = toEvents({
        completionEvent: event,
        metadata: this.metadata,
        accumulatorUtils: {
          appendToTextAccumulator: this.appendToTextAccumulator.bind(this),
          getTextAccumulator: this.getTextAccumulator.bind(this),
          resetTextAccumulator: this.resetTextAccumulator.bind(this),
        },
      });
      llmMistralEvents.push(llmEvents);
      yield* llmEvents;
    }

    // Write mistralEvents to log file
    const outputLogPath = path.join(timestampDir, "3_output.json");
    const llmOutputLogPath = path.join(timestampDir, "4_llm_output.json");
    fs.writeFileSync(outputLogPath, JSON.stringify(mistralEvents, null, 2));
    fs.writeFileSync(
      llmOutputLogPath,
      JSON.stringify(llmMistralEvents, null, 2)
    );
  }
}
