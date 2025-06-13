import { EnvironmentConfig } from "@connectors/types";

export const apiConfig = {
  getOAuthAPIConfig: (): { url: string; apiKey: string | null } => {
    return {
      url: EnvironmentConfig.getEnvVariable("OAUTH_API"),
      apiKey: EnvironmentConfig.getOptionalEnvVariable("OAUTH_API_KEY") ?? null,
    };
  },
  getDustFrontInternalAPIUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_FRONT_INTERNAL_API");
  },
  getDustFrontAPIUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_FRONT_API");
  },
  getTextExtractionUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("TEXT_EXTRACTION_URL");
  },
  getFirecrawlAPIConfig: (): { apiKey: string } => {
    return {
      apiKey: EnvironmentConfig.getEnvVariable("FIRECRAWL_API_KEY"),
    };
  },
  getUntrustedEgressProxyHost: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "UNTRUSTED_EGRESS_PROXY_HOST"
    );
  },
  getUntrustedEgressProxyPort: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "UNTRUSTED_EGRESS_PROXY_PORT"
    );
  },
};
