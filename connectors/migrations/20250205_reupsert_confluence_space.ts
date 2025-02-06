import { MIME_TYPES } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";

import { makeSpaceInternalId } from "@connectors/connectors/confluence/lib/internal_ids";
import {
  fetchConfluenceConfigurationActivity,
  getConfluenceClient,
} from "@connectors/connectors/confluence/temporal/activities";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConfluenceSpace } from "@connectors/lib/models/confluence";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: { type: "number" },
    spaceId: { type: "string" },
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

    const client = await getConfluenceClient({
      cloudId: confluenceConfig.cloudId,
      connectorId,
    });

    const space = await client.getSpaceById(spaceId);

    logger.info({ spaceName: space.name }, "Space name");

    const folderId = makeSpaceInternalId(spaceId);
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig: dataSourceConfigFromConnector(connector),
        folderId,
        parents: [folderId],
        parentId: null,
        title: space.name,
        mimeType: MIME_TYPES.CONFLUENCE.SPACE,
        sourceUrl: `${confluenceConfig.url}/wiki${space._links.webui}`,
      });
      await ConfluenceSpace.upsert({
        connectorId,
        name: space.name,
        spaceId: spaceId.toString(),
        urlSuffix: space._links.webui,
      });
    }
  }
);
