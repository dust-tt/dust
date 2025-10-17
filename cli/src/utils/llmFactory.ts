import type { LLM } from "@app/lib/llm/llm";
import { MistralLLM } from "@app/lib/llm/providers/mistral";
import type { ModelConfigurationType, ModelProviderIdType } from "@app/types";

import { setCliCredentials } from "./credentials.js";
import type { ImplementedProviderId } from "./modelRegistry.js";

export function createLLM({
  model,
  apiKey,
  temperature = 0.7,
}: {
  model: ModelConfigurationType;
  apiKey: string;
  temperature?: number;
}): LLM {
  const providerId = model.providerId as ImplementedProviderId;

  // Set the API key for the provider
  setProviderApiKey(providerId, apiKey);

  switch (providerId) {
    case "mistral":
      return new MistralLLM({
        temperature,
        model,
      });
    default:
      throw new Error(`Provider ${providerId} not implemented`);
  }
}

// Set the API key for CLI usage
export function setProviderApiKey(
  providerId: ModelProviderIdType,
  apiKey: string
): void {
  switch (providerId) {
    case "mistral":
      setCliCredentials({ MISTRAL_API_KEY: apiKey });
      break;
    case "openai":
      setCliCredentials({ OPENAI_API_KEY: apiKey });
      break;
    case "anthropic":
      setCliCredentials({ ANTHROPIC_API_KEY: apiKey });
      break;
    case "google_ai_studio":
      setCliCredentials({ GOOGLE_AI_STUDIO_API_KEY: apiKey });
      break;
  }
}