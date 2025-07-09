import { EnvironmentConfig } from "@connectors/types";

export const slackConfig = {
  getRequiredDustBaseUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_CLIENT_FACING_URL");
  },
  getRequiredSlackClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("SLACK_CLIENT_ID");
  },
  getRequiredSlackClientSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("SLACK_CLIENT_SECRET");
  },
};
