import type { GenerateContentResponse } from "@google/genai";
import { GoogleGenAI } from "@google/genai";

import { LLM } from "@app/lib/llm/llm";
import { toEvents } from "@app/lib/llm/providers/google/utils/google_to_events";
import type { LLMEvent, ProviderMetadata } from "@app/lib/llm/types";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

import { toHistory } from "./utils/conversation_to_google";

class GoogleLLM extends LLM {
  private client: GoogleGenAI;
  protected temperature: number;
  private textAccumulator: string = "";
  private reasoningAccumulator: string = "";
  private metadata: ProviderMetadata;
  constructor({
    temperature,
    model,
  }: {
    temperature: number;
    model: ModelConfigurationType;
  }) {
    super(model);
    this.client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY ?? "",
    });
    this.temperature = temperature;
    this.metadata = {
      providerId: "google_ai_studio",
      modelId: model.modelId,
    };
  }

  private updateMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  private resetAccumulators(): void {
    this.textAccumulator = "";
    this.reasoningAccumulator = "";
  }

  private appendTextAccumulator(text: string): void {
    this.textAccumulator += text;
  }

  private appendReasoningAccumulator(text: string): void {
    this.reasoningAccumulator += text;
  }

  private getTextAccumulator(): string {
    return this.textAccumulator;
  }

  private getReasoningAccumulator(): string {
    return this.reasoningAccumulator;
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent> {
    const events = this.modelStream({
      conversation,
      prompt,
    });
    this.resetAccumulators();
    for await (const event of events) {
      yield* toEvents({
        contentResponse: event,
        metadata: this.metadata,
        accumulatorUtils: {
          resetAccumulators: this.resetAccumulators.bind(this),
          appendTextAccumulator: this.appendTextAccumulator.bind(this),
          appendReasoningAccumulator:
            this.appendReasoningAccumulator.bind(this),
          getTextAccumulator: this.getTextAccumulator.bind(this),
          getReasoningAccumulator: this.getReasoningAccumulator.bind(this),
          updateMetadata: this.updateMetadata.bind(this),
        },
      });
    }
  }

  async *modelStream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt?: string;
  }): AsyncGenerator<GenerateContentResponse> {
    const { history, lastMessage } = toHistory(conversation);

    const chat = this.client.chats.create({
      model: this.model.modelId,
      history: history,
      config: {
        systemInstruction: prompt,
        temperature: this.temperature,
      },
    });
    yield* await chat.sendMessageStream({
      message: lastMessage,
    });
  }
}
