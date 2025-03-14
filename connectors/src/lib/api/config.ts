import { EnvironmentConfig } from "@connectors/types";

export const apiConfig = {
  getOAuthAPIConfig: (): { url: string; apiKey: string | null } => {
    return {
      url: EnvironmentConfig.getEnvVariable("OAUTH_API"),
      apiKey: EnvironmentConfig.getOptionalEnvVariable("OAUTH_API_KEY") ?? null,
    };
  },
  getDustFrontAPIUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_FRONT_API");
  },
  getDustAPIConfig: (): { url: string; nodeEnv: string } => {
    return {
      url: EnvironmentConfig.getEnvVariable("DUST_FRONT_API"),
      nodeEnv: EnvironmentConfig.getEnvVariable("NODE_ENV"),
    };
  },
  getTextExtractionUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("TEXT_EXTRACTION_URL");
  },
};
