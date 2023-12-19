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
    // console.log(`Completion: provider=${this.provider} model=${this.model}`);
    const completion = await this.client.chat({
      model: this.model,
      messages,
      maxTokens,
      temperature,
    });

    if (completion.object === "error") {
      throw new Error(completion.message);
    }
    if (!completion.choices || completion.choices.length === 0) {
      throw new Error(`Unexpected error: ${JSON.stringify(completion)}`);
    }

    const m = completion.choices[0].message;
    if (m.content === null) {
      throw new Error("Mistral returned null");
    }

    // console.log(`Received completion`);
    // console.log(`----------------------`);
    // console.log(completion);
    // console.log(`----------------------`);

    return {
      role: "assistant",
      content: m.content,
      usage: {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
      },
      provider: this.provider,
      model: this.model,
    };
  }
}
