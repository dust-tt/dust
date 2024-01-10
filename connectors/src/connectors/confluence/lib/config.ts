import { EnvironmentConfig } from "@connectors/connectors/config";

export const confluenceConfig = {
  getRequiredNangoConfluenceConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_CONFLUENCE_CONNECTOR_ID");
  },
};
