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
}
