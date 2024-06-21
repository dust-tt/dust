import { EnvironmentConfig } from "@dust-tt/types";

export const slackConfig = {
  getRequiredDustBaseUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_CLIENT_FACING_URL");
  },
};
