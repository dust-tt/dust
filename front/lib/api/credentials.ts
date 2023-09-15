import { CredentialsType, ProviderType } from "@app/types/provider";

const { DUST_MANAGED_OPENAI_API_KEY = "", DUST_MANAGED_ANTHROPIC_API_KEY } =
  process.env;

export const credentialsFromProviders = (
  providers: ProviderType[]
): CredentialsType => {
  const credentials: CredentialsType = {};

  providers.forEach((provider) => {
    const config = JSON.parse(provider.config) as {
      api_key: string;
      endpoint?: string;
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
      case "serpapi":
        credentials["SERP_API_KEY"] = config.api_key;
        break;
      case "serper":
        credentials["SERPER_API_KEY"] = config.api_key;
        break;
      case "browserlessapi":
        credentials["BROWSERLESS_API_KEY"] = config.api_key;
        break;
    }
  });
  return credentials;
};

export const dustManagedCredentials = (): CredentialsType => {
  return {
    OPENAI_API_KEY: DUST_MANAGED_OPENAI_API_KEY,
    ANTHROPIC_API_KEY: DUST_MANAGED_ANTHROPIC_API_KEY,
  };
};
