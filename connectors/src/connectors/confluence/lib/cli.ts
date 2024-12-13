import type {
  AdminSuccessResponseType,
  ConfluenceCommandType,
  ConfluenceUpsertPageResponseType,
  ModelId,
} from "@dust-tt/types";
import assert from "assert";
import fs from "fs/promises";

import {
  getConfluencePageParentIds,
  getSpaceHierarchy,
} from "@connectors/connectors/confluence/lib/hierarchy";
import {
  confluenceGetSpaceNameActivity,
  fetchConfluenceConfigurationActivity,
  getConfluenceClient,
  upsertConfluencePageToDataSource,
} from "@connectors/connectors/confluence/temporal/activities";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { ConfluencePage } from "@connectors/lib/models/confluence";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

interface cachedSpace {
  spaceName: string | null;
  spaceHierarchy: Record<string, string | null>;
}

async function cacheSpace(
  cachedSpaces: Record<string, cachedSpace>,
  {
    confluenceCloudId,
    connectorId,
    spaceId,
  }: {
    confluenceCloudId: string;
    connectorId: ModelId;
    spaceId: string;
  }
): Promise<cachedSpace> {
  const cachedSpace = cachedSpaces[spaceId];
  if (cachedSpace) {
    return cachedSpace;
  }
  const spaceName = await confluenceGetSpaceNameActivity({
    spaceId,
    confluenceCloudId,
    connectorId,
  });
  const spaceHierarchy = spaceName
    ? await getSpaceHierarchy(connectorId, spaceId)
    : {}; // not fetching if we couldn't get the space from Confluence API anyway
  cachedSpaces[spaceId] = { spaceName, spaceHierarchy };
  return { spaceName, spaceHierarchy };
}

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

      const pageInDb = await ConfluencePage.findOne({
        attributes: ["parentId", "skipReason"],
        where: { connectorId, pageId },
      });
      if (pageInDb && pageInDb.skipReason !== null) {
        localLogger.info("Confluence page skipped.");
        return { success: false };
      }

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

      const cachedHierarchy = await getSpaceHierarchy(
        connectorId,
        page.spaceId
      );
      const parentIds = await getConfluencePageParentIds(
        connectorId,
        { pageId: page.id, parentId: page.parentId, spaceId: page.spaceId },
        cachedHierarchy
      );

      localLogger.info("Upserting Confluence page.");
      await upsertConfluencePageToDataSource(
        page,
        space.name,
        parentIds,
        confluenceConfig,
        "batch",
        dataSourceConfig,
        loggerArgs
      );
      return { success: true };
    }
    case "upsert-pages": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.file) {
        throw new Error("Missing --file argument");
      }
      if (!args.keyInFile) {
        throw new Error("Missing --keyInFile argument");
      }
      const connectorId = args.connectorId;
      const file = args.file;
      const keyInFile = args.keyInFile;

      // parsing the JSON file
      const fileContent = await fs.readFile(file, "utf-8");
      const jsonArray = JSON.parse(fileContent);
      assert(Array.isArray(jsonArray), "The file content is not an array.");

      const pageIds = jsonArray.map((entry) => {
        assert(
          keyInFile in entry,
          `Key "${keyInFile}" not found in entry ${JSON.stringify(entry)}`
        );
        return entry[keyInFile];
      });

      // fetching the pages in DB
      const pagesInDb = Object.fromEntries(
        (
          await ConfluencePage.findAll({
            attributes: ["pageId", "skipReason"],
            where: { connectorId, pageId: pageIds },
          })
        ).map((page) => [page.pageId, page])
      );

      const connector = await ConnectorResource.fetchById(connectorId);
      assert(connector !== null, "Connector not found.");
      const dataSourceConfig = dataSourceConfigFromConnector(connector);
      const confluenceConfig =
        await fetchConfluenceConfigurationActivity(connectorId);
      const client = await getConfluenceClient(
        { cloudId: confluenceConfig?.cloudId },
        connector
      );

      const cachedSpaces: Record<string, cachedSpace> = {};

      for (const pageId of pageIds) {
        const loggerArgs = {
          connectorId,
          dataSourceId: dataSourceConfig.dataSourceId,
          pageId,
          workspaceId: dataSourceConfig.workspaceId,
        };
        const localLogger = logger.child(loggerArgs);

        const pageInDb = pagesInDb[pageId];
        if (pageInDb && pageInDb.skipReason !== null) {
          localLogger.info("Confluence page skipped.");
          continue;
        }

        const page = await client.getPageById(pageId);
        if (!page) {
          localLogger.info("Confluence page not found.");
          continue;
        }
        // fetching the space if not already cached
        const { spaceName, spaceHierarchy } = await cacheSpace(cachedSpaces, {
          connectorId,
          confluenceCloudId: confluenceConfig?.cloudId,
          spaceId: page.spaceId,
        });
        if (!spaceName) {
          localLogger.info("Confluence space not found.");
          continue;
        }

        const parentIds = await getConfluencePageParentIds(
          connectorId,
          { pageId: page.id, parentId: page.parentId, spaceId: page.spaceId },
          spaceHierarchy
        );

        localLogger.info("Upserting Confluence page.");
        await upsertConfluencePageToDataSource(
          page,
          spaceName,
          parentIds,
          confluenceConfig,
          "batch",
          dataSourceConfig,
          loggerArgs
        );
      }
      return { success: true };
    }

    default:
      throw new Error("Unknown Confluence command: " + command);
  }
};
