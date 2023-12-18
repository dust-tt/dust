export type ModelType =
  | {
      provider: "openai";
      model: "gpt3.5-turbo";
    }
  | { provider: "mistral"; model: "tiny" }
  | { provider: "anthropic"; model: "claude-instant-1.2" };

export abstract class Model {
  abstract readonly model: ModelType;
  
}
