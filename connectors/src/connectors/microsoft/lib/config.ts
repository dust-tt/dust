import { EnvironmentConfig } from "@dust-tt/types";

export const microsoftConfig = {
  getRequiredNangoMicrosoftConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_MICROSOFT_CONNECTOR_ID");
  },
};
