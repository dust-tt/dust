import OpenAI from "openai";

import { ChatCompletion, ChatMessage, Model } from "@app/lib/models";

export type OpenAIModelType = "gpt-3.5-turbo" | "gpt-4-1106-preview";

export class OpenAIModel extends Model {
  readonly provider = "openai";
  private model: OpenAIModelType;
  private openai: OpenAI;

  constructor(model: OpenAIModelType) {
    super();

    this.model = model;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async completion({
    messages,
    maxTokens,
    temperature,
  }: {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature: number;
  }): Promise<ChatCompletion> {
    const completion = await this.openai.chat.completions.create({
      messages,
      model: this.model,
      max_tokens: maxTokens,
      temperature,
    });

    const m = completion.choices[0].message;
    if (m.content === null) {
      throw new Error("OpenAI returned null");
    }
    return {
      role: "assistant",
      content: m.content,
    };
  }
}

// async function main() {
//   const model = new OpenAIModel("gpt-3.5-turbo");
//
//   const c = await model.completion({
//     messages: [
//       {
//         role: "user",
//         content: "Hello, how are you?",
//       },
//     ],
//     temperature: 1.0,
//   });
//
//   console.log(c);
// }
//
// main()
//   .then(() => console.log("Done"))
//   .catch(console.error);
