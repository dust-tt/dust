// Marketing stub: the full model type system lives in front and pulls in a
// large dependency graph. Until a build-time snapshot exists, marketing uses
// the structural shapes the pricing page needs and treats provider ids as
// plain strings.

export type ModelIdType = string;

export type ModelProviderIdType =
  | "openai"
  | "anthropic"
  | "mistral"
  | "google_ai_studio"
  | "togetherai"
  | "deepseek"
  | "fireworks"
  | "xai"
  | "noop";

export type EmbeddingProviderIdType = "openai" | "mistral" | "google_ai_studio";

export interface ModelConfig {
  modelId: ModelIdType;
  displayName: string;
  providerId: ModelProviderIdType;
}
