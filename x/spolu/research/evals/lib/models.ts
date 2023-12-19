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

export abstract class Model {
  abstract readonly provider: ProviderType;

  abstract completion({
    messages,
    maxTokens,
    temperature,
  }: {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature: number;
  }): Promise<ChatCompletion>;

  async completionWithRetry({
    messages,
    maxTokens,
    temperature,
  }: {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature: number;
  }): Promise<ChatCompletion> {
    let completion;
    try {
      completion = await this.completion({
        messages,
        maxTokens,
        temperature,
      });
    } catch (e) {
      console.log(`Retrying completion: error=${e} sleep=3s`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      completion = await this.completionWithRetry({
        messages,
        maxTokens,
        temperature,
      });
    }

    return completion;
  }
}
