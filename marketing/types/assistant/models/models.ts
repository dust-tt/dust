// Baked snapshot of the model configs the /home/api-pricing page needs.
//
// The full SUPPORTED_MODEL_CONFIGS in front is assembled from many provider
// sub-files behind a deep dependency chain (io-ts, zod, GCS-generated custom
// models, ...). Marketing only needs (modelId, displayName, providerId) to render
// the pricing table, so we keep a flat snapshot here instead of importing front.
//
// Keep in sync with front/types/assistant/models (SUPPORTED_MODEL_CONFIGS) and
// front/lib/api/assistant/token_pricing.ts when models are added or removed.
import type { ModelConfig } from "@marketing/types/assistant/models/types";

export type StaticModelIdType = string;
export type ImageModelIdType = string;

export const SUPPORTED_MODEL_CONFIGS: ReadonlyArray<ModelConfig> = [
  {
    modelId: "gpt-5.1",
    displayName: "GPT 5.1",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.2",
    displayName: "GPT 5.2",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.4",
    displayName: "GPT 5.4",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.5",
    displayName: "GPT 5.5",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.6-sol",
    displayName: "GPT 5.6 Sol",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.6-terra",
    displayName: "GPT 5.6 Terra",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.6-luna",
    displayName: "GPT 5.6 Luna",
    providerId: "openai",
  },
  {
    modelId: "gpt-5.4-nano",
    displayName: "GPT-5.4 Nano",
    providerId: "openai",
  },
  {
    modelId: "gpt-5",
    displayName: "GPT 5",
    providerId: "openai",
  },
  {
    modelId: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    providerId: "openai",
  },
  {
    modelId: "gpt-5-nano",
    displayName: "GPT-5 Nano",
    providerId: "openai",
  },
  {
    modelId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    providerId: "anthropic",
  },
  {
    modelId: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    providerId: "anthropic",
  },
  {
    modelId: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    providerId: "anthropic",
  },
  {
    modelId: "claude-fable-5",
    displayName: "Claude Fable 5",
    providerId: "anthropic",
  },
  {
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    providerId: "anthropic",
  },
  {
    modelId: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    providerId: "anthropic",
  },
  {
    modelId: "claude-haiku-4-5-20251001",
    displayName: "Claude 4.5 Haiku",
    providerId: "anthropic",
  },
  {
    modelId: "mistral-large-latest",
    displayName: "Mistral Large",
    providerId: "mistral",
  },
  {
    modelId: "mistral-medium-3-5",
    displayName: "Mistral Medium 3.5",
    providerId: "mistral",
  },
  {
    modelId: "mistral-small-latest",
    displayName: "Mistral Small",
    providerId: "mistral",
  },
  {
    modelId: "codestral-latest",
    displayName: "Mistral Codestral",
    providerId: "mistral",
  },
  {
    modelId: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash Lite",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro (Preview)",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    providerId: "google_ai_studio",
  },
  {
    modelId: "accounts/fireworks/models/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/kimi-k2p5",
    displayName: "Kimi K2.5 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/kimi-k2p6",
    displayName: "Kimi K2.6 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/glm-5p2",
    displayName: "GLM-5.2 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "grok-4.5",
    displayName: "Grok 4.5",
    providerId: "xai",
  },
  {
    modelId: "noop",
    displayName: "Noop",
    providerId: "noop",
  },
];
