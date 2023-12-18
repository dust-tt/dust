// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error: Ignore "could not find a declaration file for module" error
import MistralClient from "@mistralai/mistralai";

import { ChatCompletion, ChatMessage, Model } from "@app/lib/models";

export type MistralModelType =
  | "mistral-tiny"
  | "mistral-small"
  | "mistral-medium";

export class MistralModel extends Model {
  readonly provider = "mistral";
  private model: MistralModelType;
  private client: any;

  constructor(model: MistralModelType) {
    super();

    this.model = model;
    this.client = new MistralClient(process.env.MISTRAL_API_KEY);
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
    const completion = await this.client.chat({
      model: this.model,
      messages,
      maxTokens,
      temperature,
    });

    return completion.choices[0].message as ChatCompletion;
  }
}

// async function main() {
//   const model = new MistralModel("mistral-tiny");
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
