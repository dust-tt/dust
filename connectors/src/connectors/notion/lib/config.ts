import { EnvironmentConfig } from "@dust-tt/types";

export const notionConfig = {
  getRequiredNangoNotionConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_NOTION_CONNECTOR_ID");
  },
};
