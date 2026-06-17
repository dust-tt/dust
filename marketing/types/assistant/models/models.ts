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
    modelId: "gpt-3.5-turbo",
    displayName: "GPT 3.5 turbo",
    providerId: "openai",
  },
  {
    modelId: "gpt-4-turbo",
    displayName: "GPT 4 turbo",
    providerId: "openai",
  },
  {
    modelId: "gpt-4o",
    displayName: "GPT 4o",
    providerId: "openai",
  },
  {
    modelId: "gpt-4o-2024-08-06",
    displayName: "GPT 4o",
    providerId: "openai",
  },
  {
    modelId: "gpt-4o-mini",
    displayName: "GPT 4o-mini",
    providerId: "openai",
  },
  {
    modelId: "gpt-4.1-2025-04-14",
    displayName: "GPT 4.1",
    providerId: "openai",
  },
  {
    modelId: "gpt-4.1-mini-2025-04-14",
    displayName: "GPT 4.1 mini",
    providerId: "openai",
  },
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
    modelId: "o1",
    displayName: "o1",
    providerId: "openai",
  },
  {
    modelId: "o1-mini",
    displayName: "o1-mini",
    providerId: "openai",
  },
  {
    modelId: "o3",
    displayName: "o3",
    providerId: "openai",
  },
  {
    modelId: "o3-mini",
    displayName: "o3-mini",
    providerId: "openai",
  },
  {
    modelId: "o4-mini",
    displayName: "o4-mini",
    providerId: "openai",
  },
  {
    modelId: "claude-4-opus-20250514",
    displayName: "Claude 4 Opus",
    providerId: "anthropic",
  },
  {
    modelId: "claude-4-sonnet-20250514",
    displayName: "Claude 4 Sonnet",
    providerId: "anthropic",
  },
  {
    modelId: "claude-sonnet-4-5-20250929",
    displayName: "Claude 4.5 Sonnet",
    providerId: "anthropic",
  },
  {
    modelId: "claude-opus-4-5-20251101",
    displayName: "Claude 4.5 Opus",
    providerId: "anthropic",
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
    modelId: "claude-3-opus-20240229",
    displayName: "Claude 3 Opus",
    providerId: "anthropic",
  },
  {
    modelId: "claude-3-5-sonnet-20240620",
    displayName: "Claude 3.5 Sonnet",
    providerId: "anthropic",
  },
  {
    modelId: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    providerId: "anthropic",
  },
  {
    modelId: "claude-3-7-sonnet-20250219",
    displayName: "Claude 3.7 Sonnet",
    providerId: "anthropic",
  },
  {
    modelId: "claude-3-haiku-20240307",
    displayName: "Claude 3 Haiku",
    providerId: "anthropic",
  },
  {
    modelId: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku",
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
    modelId: "mistral-medium",
    displayName: "Mistral Medium",
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
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3-pro-preview",
    displayName: "Gemini 3 Pro",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash Lite",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3.1-flash-lite-preview",
    displayName: "Gemini 3.1 Flash Lite (Preview)",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro (Preview)",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash (Preview)",
    providerId: "google_ai_studio",
  },
  {
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    providerId: "google_ai_studio",
  },
  {
    modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    displayName: "Llama 3.3 70B Instruct Turbo",
    providerId: "togetherai",
  },
  {
    modelId: "Qwen/Qwen2.5-Coder-32B-Instruct",
    displayName: "Qwen 2.5 Coder 32B Instruct",
    providerId: "togetherai",
  },
  {
    modelId: "Qwen/QwQ-32B-Preview",
    displayName: "Qwen QwQ 32B Preview",
    providerId: "togetherai",
  },
  {
    modelId: "Qwen/Qwen2-72B-Instruct",
    displayName: "Qwen 72B Instruct",
    providerId: "togetherai",
  },
  {
    modelId: "deepseek-ai/DeepSeek-V3",
    displayName: "DeepSeek V3 (TogetherAI)",
    providerId: "togetherai",
  },
  {
    modelId: "deepseek-chat",
    displayName: "DeepSeek",
    providerId: "deepseek",
  },
  {
    modelId: "accounts/fireworks/models/deepseek-v3p2",
    displayName: "DeepSeek V3.2 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/kimi-k2-instruct-0905",
    displayName: "Kimi K2 Instruct (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/kimi-k2p5",
    displayName: "Kimi K2.5 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/minimax-m2p5",
    displayName: "MiniMax M2.5 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/glm-5",
    displayName: "GLM-5 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "accounts/fireworks/models/glm-5p2",
    displayName: "GLM-5.2 (Fireworks)",
    providerId: "fireworks",
  },
  {
    modelId: "grok-3-latest",
    displayName: "Grok 3",
    providerId: "xai",
  },
  {
    modelId: "grok-3-mini-latest",
    displayName: "Grok 3 Mini",
    providerId: "xai",
  },
  {
    modelId: "grok-4-latest",
    displayName: "Grok 4",
    providerId: "xai",
  },
  {
    modelId: "grok-4-fast-non-reasoning-latest",
    displayName: "Grok 4 Fast (Non-Reasoning)",
    providerId: "xai",
  },
  {
    modelId: "grok-4-1-fast-reasoning-latest",
    displayName: "Grok 4.1 Fast",
    providerId: "xai",
  },
  {
    modelId: "grok-4-1-fast-non-reasoning-latest",
    displayName: "Grok 4.1 Fast (Non-Reasoning)",
    providerId: "xai",
  },
  {
    modelId: "noop",
    displayName: "Noop",
    providerId: "noop",
  },
];
