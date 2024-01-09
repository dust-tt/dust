export const notionConfig = {
  getRequiredNangoNotionConnectorId: (): string => {
    const connectorId = process.env.NANGO_NOTION_CONNECTOR_ID;
    if (!connectorId) {
      throw new Error("NANGO_NOTION_CONNECTOR_ID is required but not set");
    }
    return connectorId;
  },
};
