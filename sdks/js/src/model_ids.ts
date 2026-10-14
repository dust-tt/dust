/**
 * Canonical list of model LLM IDs known to the public SDK.
 * Keep in sync with front `STATIC_MODEL_IDS` (see front sdk_drift.test.ts).
 */
export const KNOWN_MODEL_LLM_IDS = [
  "gpt-3.5-turbo",
  "gpt-4-turbo",
  "gpt-4o-2024-08-06",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini-2025-04-14",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-terra-long-context",
  "gpt-5.6-luna",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5",
  "o1",
  "o1-mini",
  "o3",
  "o3-mini",
  "o4-mini",
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229",
  "claude-4-opus-20250514",
  "claude-4-sonnet-20250514",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5-20251101",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-opus-5-5",
  "claude-fable-5",
  "claude-fable-5-1",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "mistral-large-latest",
  "mistral-large-4",
  "mistral-medium",
  "mistral-medium-3-5",
  "mistral-small-latest",
  "codestral-latest",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-4-argon",
  "deepseek-chat",
  "accounts/fireworks/models/deepseek-v3p2",
  "accounts/fireworks/models/deepseek-v4-pro",
  "accounts/fireworks/models/deepseek-v4-pro-0813",
  "accounts/fireworks/models/deepseek-v4-flash-0731",
  "accounts/fireworks/models/deepseek-v4p1-flash",
  "accounts/fireworks/models/kimi-k2-instruct",
  "accounts/fireworks/models/kimi-k2-instruct-0905",
  "accounts/fireworks/models/kimi-k2p5",
  "accounts/fireworks/models/kimi-k2p6",
  "accounts/fireworks/models/kimi-k3",
  "accounts/fireworks/models/minimax-m2p5",
  "accounts/fireworks/models/glm-5",
  "accounts/fireworks/models/glm-5p2",
  "accounts/fireworks/models/glm-5p3",
  "accounts/fireworks/models/glm-5p3-flash",
  "accounts/fireworks/models/inkling",
  "grok-3-latest",
  "grok-3-mini-latest",
  "grok-4.5",
  "grok-4.6",
  "grok-4.7",
  "grok-4-latest",
  "grok-4-fast-non-reasoning-latest",
  "grok-4-fast-reasoning-latest",
  "grok-4-1-fast-non-reasoning-latest",
  "grok-4-1-fast-reasoning-latest",
  "simulated-failure-model",
  "noop",
  "auto",
  "auto_fast",
  "auto_complex",
] as const;

export type KnownModelLLMId = (typeof KNOWN_MODEL_LLM_IDS)[number];

export type ModelProviderId =
  | "openai"
  | "anthropic"
  | "mistral"
  | "google_ai_studio"
  | "deepseek"
  | "fireworks"
  | "xai"
  | "noop"
  | "auto"
  | "auto_fast"
  | "auto_complex";

const KNOWN_MODEL_LLM_ID_BY_LOWER = new Map<string, KnownModelLLMId>(
  KNOWN_MODEL_LLM_IDS.map((modelId) => [modelId.toLowerCase(), modelId])
);

export function isKnownModelLLMId(modelId: string): modelId is KnownModelLLMId {
  return KNOWN_MODEL_LLM_ID_BY_LOWER.has(modelId.toLowerCase());
}

export function canonicalizeKnownModelLLMId(
  modelId: string
): KnownModelLLMId | undefined {
  return KNOWN_MODEL_LLM_ID_BY_LOWER.get(modelId.toLowerCase());
}

/**
 * Resolve the provider for a known model id. Returns null when the id is not a
 * known model (callers should not invent provider/model pairs for arbitrary
 * strings).
 */
export function getProviderIdForKnownModelId(
  modelId: string
): ModelProviderId | null {
  const canonical = canonicalizeKnownModelLLMId(modelId);
  if (!canonical) {
    return null;
  }

  if (canonical.startsWith("accounts/fireworks/")) {
    return "fireworks";
  }
  if (canonical.startsWith("claude-")) {
    return "anthropic";
  }
  if (canonical.startsWith("gemini-")) {
    return "google_ai_studio";
  }
  if (canonical.startsWith("grok-")) {
    return "xai";
  }
  if (canonical.startsWith("mistral-") || canonical.startsWith("codestral-")) {
    return "mistral";
  }
  if (canonical === "deepseek-chat") {
    return "deepseek";
  }
  if (canonical === "noop") {
    return "noop";
  }
  if (canonical === "auto") {
    return "auto";
  }
  if (canonical === "auto_fast") {
    return "auto_fast";
  }
  if (canonical === "auto_complex") {
    return "auto_complex";
  }
  // OpenAI family (gpt-*, o1/o3/o4-*) and internal simulated-failure-model.
  return "openai";
}
