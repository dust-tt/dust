import { EnvironmentConfig } from "@connectors/types";

export const slackConfig = {
  getRequiredSlackClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("SLACK_CLIENT_ID");
  },
  getRequiredSlackClientSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("SLACK_CLIENT_SECRET");
  },
};
