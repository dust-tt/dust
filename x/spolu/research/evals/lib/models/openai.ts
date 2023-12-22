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
      // logprobs: true,
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

export class LogProbModel {
  readonly provider = "openai";
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async value(prefix: string, completion: string) {
    const c = await this.openai.completions.create({
      model: "text-davinci-003",
      prompt: prefix + "\n--\n" + completion,
      max_tokens: 0,
      echo: true,
      logprobs: 1,
    });

    let logprob = 0;
    let start = false;

    if (
      !c.choices[0].logprobs ||
      !c.choices[0].logprobs.tokens ||
      !c.choices[0].logprobs.token_logprobs
    ) {
      return 0;
    }

    for (let i = 0; i < (c.choices[0].logprobs.tokens?.length || 0); i++) {
      const t = c.choices[0].logprobs.tokens[i];
      const l = c.choices[0].logprobs.token_logprobs[i];
      if (t === "--") {
        start = true;
      } else {
        if (start) {
          logprob += l;
        }
      }
    }

    return logprob;
  }
}
