import { EnvironmentConfig } from "@dust-tt/types";

export const apiConfig = {
  getDustAPIConfig: (): { url: string; nodeEnv: string } => {
    return {
      // Dust production API URL is hardcoded for now.
      url: "https://dust.tt",
      nodeEnv: EnvironmentConfig.getEnvVariable("NODE_ENV"),
    };
  },
  getTextExtractionUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("TEXT_EXTRACTION_URL");
  },
};
