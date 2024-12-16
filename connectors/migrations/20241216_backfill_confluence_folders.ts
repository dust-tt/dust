import { makeScript } from "scripts/helpers";

import { makeSpaceInternalId } from "@connectors/connectors/confluence/lib/internal_ids";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertFolderNode } from "@connectors/lib/data_sources";
import { ConfluenceSpace } from "@connectors/lib/models/confluence";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("confluence", {});

  for (const connector of connectors) {
    const confluenceSpaces = await ConfluenceSpace.findAll({
      attributes: ["spaceId", "name"],
      where: { connectorId: connector.id },
    });
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    if (execute) {
      for (const space of confluenceSpaces) {
        await upsertFolderNode({
          dataSourceConfig,
          folderId: makeSpaceInternalId(space.spaceId),
          parents: [makeSpaceInternalId(space.spaceId)],
          title: space.name,
        });
      }
      logger.info(
        `Upserted ${confluenceSpaces.length} spaces for connector ${connector.id}`
      );
    } else {
      logger.info(
        `Found ${confluenceSpaces.length} spaces for connector ${connector.id}`
      );
    }
  }
});
