import { EnvironmentConfig } from "@connectors/connectors/config";

export const notionConfig = {
  getRequiredNangoNotionConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_NOTION_CONNECTOR_ID");
  },
};
