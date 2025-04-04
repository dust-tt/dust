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
import { INTERNAL_MIME_TYPES } from "@connectors/types";

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

    const { cloudId, url: baseUrl } =
      await fetchConfluenceConfigurationActivity(connectorId);

    const client = await getConfluenceClient({ cloudId, connectorId });

    const space = await client.getSpaceById(spaceId);
    const folderId = makeSpaceInternalId(spaceId);

    logger.info(
      { spaceId, spaceName: space.name, folderId },
      "Upserting Confluence space."
    );
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig: dataSourceConfigFromConnector(connector),
        folderId,
        parents: [folderId],
        parentId: null,
        title: space.name,
        mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.SPACE,
        sourceUrl: `${baseUrl}/wiki${space._links.webui}`,
      });
      const spaceInDb = await ConfluenceSpace.findOne({
        where: {
          connectorId,
          spaceId,
        },
      });
      if (!spaceInDb) {
        await ConfluenceSpace.create({
          connectorId,
          name: space.name,
          spaceId: spaceId,
          urlSuffix: space._links.webui,
        });
      } else if (spaceInDb.name !== space.name) {
        await spaceInDb.update({ name: space.name });
      }
    }
  }
);
