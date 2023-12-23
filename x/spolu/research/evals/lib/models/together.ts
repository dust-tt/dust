import axios from "axios";

import { ChatCompletion, ChatQuery, Model } from "@app/lib/models";

export type TogetherModelType =
  | "llama-2-70b-chat"
  | "llama-2-13b-chat"
  | "CodeLlama-34b-Instruct";

export class TogetherModel extends Model {
  readonly provider = "together";
  private _model: TogetherModelType;
  private _api_key: string;

  constructor(model: TogetherModelType) {
    super();

    this._model = model;
    this._api_key = process.env.TOGETHER_API_KEY || "";
  }

  model(): string {
    return this._model;
  }

  async completion(query: ChatQuery): Promise<ChatCompletion> {
    const prompt = query.messages
      .map((m) => {
        if (["user", "system"].includes(m.role)) {
          return `[INST] ${m.content} [/INST]`;
        } else {
          return m.content;
        }
      })
      .join("\n");

    try {
      const r = await axios.post(
        "https://api.together.xyz/inference",
        {
          model: `togethercomputer/${this._model}`,
          max_tokens: query.maxTokens,
          prompt,
          temperature: query.temperature,
          stop: ["[/INST]", "</s>"],
          type: "chat",
        },
        {
          headers: {
            Authorization: `Bearer ${this._api_key}`,
          },
        }
      );

      console.log(r);

      if (!r.data || !r.data.output) {
        throw new Error("Failed to fetch from Together: no output");
      }
      if (!r.data.output.choices || r.data.output.choices.length == 0) {
        throw new Error("Failed to fetch from Together: no choices");
      }
      if (!r.data.output.choices[0].text) {
        throw new Error("Failed to fetch from Together: no text");
      }

      return {
        role: "assistant",
        content: r.data.output.choices[0].text.trim(),
        usage: {
          promptTokens: r.data.output.usage.prompt_tokens,
          completionTokens: r.data.output.usage.completion_tokens,
        },
        provider: this.provider,
        model: this._model,
      };
    } catch (e) {
      // console.log(e.response.data);
      throw new Error(`Failed to fetch from Together: ${e}`);
    }
  }
}
