import type {
  AdminSuccessResponseType,
  ConfluenceCommandType,
  ConfluenceUpsertPageResponseType,
} from "@dust-tt/types";

import {
  fetchConfluenceConfigurationActivity,
  getConfluenceClient,
  upsertConfluencePageToDataSource,
} from "@connectors/connectors/confluence/temporal/activities";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export const confluence = async ({
  command,
  args,
}: ConfluenceCommandType): Promise<
  AdminSuccessResponseType | ConfluenceUpsertPageResponseType
> => {
  const logger = topLogger.child({ majorCommand: "confluence", command, args });
  switch (command) {
    case "upsert-page": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const connectorId = args.connectorId;
      const pageId = args.pageId;

      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error("Connector not found.");
      }
      const dataSourceConfig = dataSourceConfigFromConnector(connector);
      const confluenceConfig =
        await fetchConfluenceConfigurationActivity(connectorId);

      const loggerArgs = {
        connectorId,
        dataSourceId: dataSourceConfig.dataSourceId,
        pageId,
        workspaceId: dataSourceConfig.workspaceId,
      };
      const localLogger = logger.child(loggerArgs);

      const client = await getConfluenceClient(
        { cloudId: confluenceConfig?.cloudId },
        connector
      );

      const page = await client.getPageById(pageId);
      if (!page) {
        localLogger.info("Confluence page not found.");
        return { success: false };
      }
      const space = await client.getSpaceById(page.spaceId);
      if (!space) {
        localLogger.info("Confluence space not found.");
        return { success: false };
      }

      localLogger.info("Upserting Confluence page.");
      await upsertConfluencePageToDataSource(
        page,
        space.name,
        confluenceConfig,
        "batch",
        dataSourceConfig,
        loggerArgs
      );
      return { success: true };
    }

    default:
      throw new Error("Unknown Confluence command: " + command);
  }
};
