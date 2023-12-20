import OpenAI from "openai";

import { ChatCompletion, ChatQuery, Model } from "@app/lib/models";

export type OpenAIModelType = "gpt-3.5-turbo" | "gpt-4-1106-preview";

export class OpenAIModel extends Model {
  readonly provider = "openai";
  private _model: OpenAIModelType;
  private openai: OpenAI;

  constructor(model: OpenAIModelType) {
    super();

    this._model = model;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  model(): string {
    return this._model;
  }

  async completion(query: ChatQuery): Promise<ChatCompletion> {
    const completion = await this.openai.chat.completions.create({
      model: this._model,
      messages: query.messages,
      max_tokens: query.maxTokens,
      temperature: query.temperature,
    });

    const m = completion.choices[0].message;

    if (m.content === null) {
      throw new Error("OpenAI returned null");
    }

    return {
      role: "assistant",
      content: m.content,
      usage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
      },
      provider: this.provider,
      model: this._model,
    };
  }
}
