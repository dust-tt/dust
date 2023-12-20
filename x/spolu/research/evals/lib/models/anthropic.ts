import Anthropic from "@anthropic-ai/sdk";

import { ChatCompletion, ChatQuery, Model } from "@app/lib/models";

export type AnthropicModelType = "claude-2.1" | "claude-instant-1.2";

export class AnthropicModel extends Model {
  readonly provider = "anthropic";
  private _model: AnthropicModelType;
  private anthropic: Anthropic;

  constructor(model: AnthropicModelType) {
    super();

    this._model = model;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  model(): string {
    return this._model;
  }

  async completion(query: ChatQuery): Promise<ChatCompletion> {
    const messages: {
      role: "user" | "assistant";
      content: string;
    }[] = query.messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    // If two messages in a row are user, merge them.
    for (let i = 1; i < messages.length; i++) {
      if (messages[i - 1].role === "user" && messages[i].role === "user") {
        messages[i - 1].content += "\n" + messages[i].content;
        messages.splice(i, 1);
        i--;
      }
    }

    const completion = await this.anthropic.beta.messages.create({
      "anthropic-beta": "messages-2023-12-15",
      model: this._model,
      messages,
      max_tokens: query.maxTokens || 4096,
      temperature: query.temperature,
      // logprobs: true,
    });

    const m = completion.content[0];

    if (m.text === null) {
      throw new Error("Anthropic returned null");
    }

    return {
      role: "assistant",
      content: m.text,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      provider: this.provider,
      model: this._model,
    };
  }
}
