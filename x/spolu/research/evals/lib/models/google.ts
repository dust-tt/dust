import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";

import { ChatCompletion, ChatQuery, Model } from "@app/lib/models";

export type GoogleModelType = "gemini-pro";

export class GoogleModel extends Model {
  readonly provider = "google";
  private _model: GoogleModelType;
  private genAI: GoogleGenerativeAI;
  private genAIModel: GenerativeModel;

  constructor(model: GoogleModelType) {
    super();

    this._model = model;
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
    this.genAIModel = this.genAI.getGenerativeModel({ model });
  }

  model(): string {
    return this._model;
  }

  async completion(query: ChatQuery): Promise<ChatCompletion> {
    const messages: {
      role: "user" | "model";
      parts: string;
    }[] = query.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: m.content,
    }));

    if (messages.length === 0) {
      throw new Error("No messages provided");
    }
    if (messages[messages.length - 1].role !== "user") {
      throw new Error("Last message must be from user");
    }

    // If two messages in a row are user, merge them.
    for (let i = 1; i < messages.length; i++) {
      if (messages[i - 1].role === "user" && messages[i].role === "user") {
        messages[i - 1].parts += "\n" + messages[i].parts;
        messages.splice(i, 1);
        i--;
      }
    }

    const chat = this.genAIModel.startChat({
      history: messages.slice(0, -1),
      generationConfig: {
        maxOutputTokens: query.maxTokens,
      },
    });

    const result = await chat.sendMessage(messages[messages.length - 1].parts);
    const text = result.response.text();

    return {
      role: "assistant",
      content: text,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      provider: this.provider,
      model: this._model,
    };
  }
}
