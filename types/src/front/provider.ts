import { MODEL_PROVIDER_IDS } from "./lib/assistant";

export const APP_MODEL_PROVIDER_IDS = [
  ...MODEL_PROVIDER_IDS,
  "azure_openai",
] as const;

export type AppsModelProviderId = (typeof APP_MODEL_PROVIDER_IDS)[number];

export interface ProviderType<T = string> {
  providerId: T;
  config: string;
}

export type ModelProviderType = ProviderType<AppsModelProviderId>;

export type CredentialsType = {
  OPENAI_API_KEY?: string;
  COHERE_API_KEY?: string;
  AI21_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  ANTHROPIC_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  TEXTSYNTH_API_KEY?: string;
  SERP_API_KEY?: string;
  SERPER_API_KEY?: string;
  BROWSERLESS_API_KEY?: string;
  GOOGLE_AI_STUDIO_API_KEY?: string;
};

export function isModelProviderType(
  providerId: unknown
): providerId is ModelProviderType {
  const modelProviderIds = [...APP_MODEL_PROVIDER_IDS] as string[];
  return (
    typeof providerId === "string" && modelProviderIds.includes(providerId)
  );
}
