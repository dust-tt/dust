import type { CredentialsType, ProviderType } from "../provider";

const {
  DUST_MANAGED_ANTHROPIC_API_KEY = "",
  DUST_MANAGED_AZURE_OPENAI_API_KEY = "",
  DUST_MANAGED_AZURE_OPENAI_ENDPOINT = "",
  DUST_MANAGED_OPENAI_API_KEY = "",
  DUST_MANAGED_TEXTSYNTH_API_KEY = "",
  DUST_MANAGED_MISTRAL_API_KEY = "",
  DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY = "",
  DUST_MANAGED_SERP_API_KEY = "",
  DUST_MANAGED_BROWSERLESS_API_KEY = "",
  DUST_MANAGED_TOGETHERAI_API_KEY = "",
  DUST_MANAGED_DEEPSEEK_API_KEY = "",
  DUST_MANAGED_FIREWORKS_API_KEY = "",
  DUST_MANAGED_XAI_API_KEY = "",
  DUST_MANAGED_FIRECRAWL_API_KEY = "",
  DUST_MANAGED_ELEVENLABS_API_KEY = "",
  DUST_REGION = "",
} = process.env;

export const credentialsFromProviders = (
  providers: ProviderType[]
): CredentialsType => {
  const credentials: CredentialsType = {};
  providers.forEach((provider) => {
    const config = JSON.parse(provider.config) as {
      api_key?: string;
      endpoint?: string;
      service_account?: string;
    };

    switch (provider.providerId) {
      case "openai":
        credentials["OPENAI_API_KEY"] = config.api_key;
        break;
      case "cohere":
        credentials["COHERE_API_KEY"] = config.api_key;
        break;
      case "ai21":
        credentials["AI21_API_KEY"] = config.api_key;
        break;
      case "azure_openai":
        credentials["AZURE_OPENAI_API_KEY"] = config.api_key;
        credentials["AZURE_OPENAI_ENDPOINT"] = config.endpoint;
        break;
      case "anthropic":
        credentials["ANTHROPIC_API_KEY"] = config.api_key;
        break;
      case "mistral":
        credentials["MISTRAL_API_KEY"] = config.api_key;
        break;
      case "textsynth":
        credentials["TEXTSYNTH_API_KEY"] = config.api_key;
        break;
      case "serpapi":
        credentials["SERP_API_KEY"] = config.api_key;
        break;
      case "serper":
        credentials["SERPER_API_KEY"] = config.api_key;
        break;
      case "browserlessapi":
        credentials["BROWSERLESS_API_KEY"] = config.api_key;
        break;
      case "google_ai_studio":
        credentials["GOOGLE_AI_STUDIO_API_KEY"] = config.api_key;
        break;
      case "togetherai":
        credentials["TOGETHERAI_API_KEY"] = config.api_key;
        break;
      case "deepseek":
        credentials["DEEPSEEK_API_KEY"] = config.api_key;
        break;
      case "fireworks":
        credentials["FIREWORKS_API_KEY"] = config.api_key;
        break;
      case "xai":
        credentials["XAI_API_KEY"] = config.api_key;
        break;
      case "firecrawl":
        credentials["FIRECRAWL_API_KEY"] = config.api_key;
        break;
    }
  });
  return credentials;
};

export const dustManagedCredentials = (): CredentialsType => {
  return {
    ANTHROPIC_API_KEY: DUST_MANAGED_ANTHROPIC_API_KEY,
    AZURE_OPENAI_API_KEY: DUST_MANAGED_AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: DUST_MANAGED_AZURE_OPENAI_ENDPOINT,
    MISTRAL_API_KEY: DUST_MANAGED_MISTRAL_API_KEY,
    OPENAI_API_KEY: DUST_MANAGED_OPENAI_API_KEY,
    // In Core this will determine the openai endpoint we use (EU vs US).
    OPENAI_USE_EU_ENDPOINT: DUST_REGION === "europe-west1" ? "true" : "false",
    TEXTSYNTH_API_KEY: DUST_MANAGED_TEXTSYNTH_API_KEY,
    GOOGLE_AI_STUDIO_API_KEY: DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY,
    SERP_API_KEY: DUST_MANAGED_SERP_API_KEY,
    BROWSERLESS_API_KEY: DUST_MANAGED_BROWSERLESS_API_KEY,
    TOGETHERAI_API_KEY: DUST_MANAGED_TOGETHERAI_API_KEY,
    DEEPSEEK_API_KEY: DUST_MANAGED_DEEPSEEK_API_KEY,
    FIREWORKS_API_KEY: DUST_MANAGED_FIREWORKS_API_KEY,
    XAI_API_KEY: DUST_MANAGED_XAI_API_KEY,
    FIRECRAWL_API_KEY: DUST_MANAGED_FIRECRAWL_API_KEY,
    ELEVENLABS_API_KEY: DUST_MANAGED_ELEVENLABS_API_KEY,
  };
};
