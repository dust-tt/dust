import type { GenerateContentResponse } from "@google/genai";
import { GoogleGenAI } from "@google/genai";

import { LLM } from "@app/lib/llm/llm";
import type { LLMEvent } from "@app/lib/llm/types";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";

import { toHistory } from "./utils/conversation_to_google";

class GoogleLLM extends LLM {
  private client: GoogleGenAI;
  protected temperature: number;
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
    for await (const _event of events) {
      yield {};
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
