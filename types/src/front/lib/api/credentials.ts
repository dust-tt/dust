import { CredentialsType, ProviderType } from "../../../front/provider";

const {
  DUST_MANAGED_ANTHROPIC_API_KEY = "",
  DUST_MANAGED_AZURE_OPENAI_API_KEY = "",
  DUST_MANAGED_AZURE_OPENAI_ENDPOINT = "",
  DUST_MANAGED_OPENAI_API_KEY = "",
  DUST_MANAGED_TEXTSYNTH_API_KEY = "",
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
      case "google_vertex_ai":
        credentials["GOOGLE_VERTEX_AI_SERVICE_ACCOUNT_JSON"] =
          config.service_account;
        credentials["GOOGLE_VERTEX_AI_ENDPOINT"] = config.endpoint;
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
    OPENAI_API_KEY: DUST_MANAGED_OPENAI_API_KEY,
    TEXTSYNTH_API_KEY: DUST_MANAGED_TEXTSYNTH_API_KEY,
  };
};
