import { hash as blake3 } from "blake3";

export const ValidProviderTypes = ["openai", "mistral"] as const;
export type ProviderType = (typeof ValidProviderTypes)[number];

export type ChatMessage = {
  role: "user" | "system" | "assistant";
  content: string;
  name?: string;
};

export type ChatCompletion = {
  role: "assistant";
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  provider: ProviderType;
  model: string;
};

export type ChatQuery = {
  provider: ProviderType;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature: number;
};

export function hashQuery(query: ChatQuery): string {
  const b = blake3(JSON.stringify(query));
  return Buffer.from(b).toString("hex");
}

export abstract class Model {
  abstract readonly provider: ProviderType;

  abstract model(): string;
  abstract completion(query: ChatQuery): Promise<ChatCompletion>;

  async completionWithRetry(query: ChatQuery): Promise<ChatCompletion> {
    let completion;
    try {
      completion = await this.completion(query);
    } catch (e) {
      console.log(`Retrying completion: error=${e} sleep=3s`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      completion = await this.completionWithRetry(query);
    }

    return completion;
  }
}
