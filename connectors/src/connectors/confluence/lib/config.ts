import { EnvironmentConfig } from "@dust-tt/types";

export const confluenceConfig = {
  getRequiredNangoConfluenceConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_CONFLUENCE_CONNECTOR_ID");
  },
};
