import { MIME_TYPES } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";

import { makeSpaceInternalId } from "@connectors/connectors/confluence/lib/internal_ids";
import {
  confluenceGetSpaceNameActivity,
  fetchConfluenceConfigurationActivity,
} from "@connectors/connectors/confluence/temporal/activities";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConfluenceSpace } from "@connectors/lib/models/confluence";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: { type: "number" },
    spaceId: { type: "number" },
  },
  async ({ execute, connectorId, spaceId }, logger) => {
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }
    const confluenceConfig =
      await fetchConfluenceConfigurationActivity(connectorId);
    if (!confluenceConfig) {
      throw new Error("No configuration found.");
    }
    const spaceName = await confluenceGetSpaceNameActivity({
      confluenceCloudId: confluenceConfig.cloudId,
      connectorId,
      spaceId: spaceId.toString(),
    });

    if (!spaceName) {
      logger.error("Space name not found.");
      return;
    }

    logger.info({ spaceName }, "Space name");

    const spaceInDb = await ConfluenceSpace.findOne({
      attributes: ["urlSuffix"],
      where: { connectorId, spaceId },
    });
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig: dataSourceConfigFromConnector(connector),
        folderId: makeSpaceInternalId(spaceId.toString()),
        parents: [makeSpaceInternalId(spaceId.toString())],
        parentId: null,
        title: spaceName,
        mimeType: MIME_TYPES.CONFLUENCE.SPACE,
        sourceUrl:
          spaceInDb?.urlSuffix &&
          `${confluenceConfig.url}/wiki${spaceInDb.urlSuffix}`,
      });
    }
  }
);
