import { makeScript } from "scripts/helpers";

import {
  getHelpCenterCollectionInternalId,
  getParentIdsForCollection,
  getTeamInternalId,
  getTeamsInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import {
  IntercomCollectionModel,
  IntercomHelpCenterModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MIME_TYPES } from "@connectors/types";

async function createFolderNodes(execute: boolean) {
  const connectors = await ConnectorResource.listByType("intercom", {});

  for (const connector of connectors) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    // Create Teams folder
    console.log(
      `[${connector.id}] -> ${JSON.stringify({ folderId: getTeamsInternalId(connector.id), parents: [getTeamsInternalId(connector.id)] })}`
    );
    if (execute) {
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: getTeamsInternalId(connector.id),
        parents: [getTeamsInternalId(connector.id)],
        parentId: null,
        title: "Conversations",
        mimeType: MIME_TYPES.INTERCOM.TEAMS_FOLDER,
      });
    }

    const teams = await IntercomTeamModel.findAll({
      where: {
        connectorId: connector.id,
      },
    });
    // Create a team folder for each team
    await concurrentExecutor(
      teams,
      async (team) => {
        const teamInternalId = getTeamInternalId(connector.id, team.teamId);
        console.log(
          `[${connector.id}] -> ${JSON.stringify({ folderId: teamInternalId, parents: [teamInternalId, getTeamsInternalId(connector.id)] })}`
        );
        if (execute) {
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: teamInternalId,
            parents: [teamInternalId, getTeamsInternalId(connector.id)],
            parentId: getTeamsInternalId(connector.id),
            title: team.name,
            mimeType: MIME_TYPES.INTERCOM.TEAM,
          });
        }
      },
      { concurrency: 16 }
    );

    // Length = 1, for loop just in case
    const workspaces = await IntercomWorkspaceModel.findAll({
      where: {
        connectorId: connector.id,
      },
    });

    for (const workspace of workspaces) {
      // Length mostly 1
      const helpCenters = await IntercomHelpCenterModel.findAll({
        where: {
          connectorId: connector.id,
          intercomWorkspaceId: workspace.intercomWorkspaceId,
        },
      });

      for (const helpCenter of helpCenters) {
        const collections = await IntercomCollectionModel.findAll({
          where: {
            connectorId: connector.id,
            helpCenterId: helpCenter.helpCenterId,
          },
        });

        // Create a collection folder for each collection
        await concurrentExecutor(
          collections,
          async (collection) => {
            const collectionInternalId = getHelpCenterCollectionInternalId(
              connector.id,
              collection.collectionId
            );
            const collectionParents = await getParentIdsForCollection({
              connectorId: connector.id,
              collectionId: collection.collectionId,
              helpCenterId: helpCenter.helpCenterId,
            });
            console.log(
              `[${connector.id}] -> ${JSON.stringify({ folderId: collectionInternalId, parents: collectionParents })}`
            );
            if (execute) {
              await upsertDataSourceFolder({
                dataSourceConfig,
                folderId: collectionInternalId,
                parents: collectionParents,
                parentId: collectionParents[1] || null,
                title: collection.name,
                mimeType: MIME_TYPES.INTERCOM.COLLECTION,
              });
            }
          },
          { concurrency: 16 }
        );
      }
    }
  }
}
makeScript({}, async ({ execute }) => {
  await createFolderNodes(execute);
});
