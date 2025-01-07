import { makeScript } from "scripts/helpers";

import {
  getDataSourceNodeMimeType,
  getHelpCenterCollectionInternalId,
  getHelpCenterInternalId,
  getParentIdsForCollection,
  getTeamInternalId,
  getTeamsInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import {
  IntercomCollection,
  IntercomHelpCenter,
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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
        mimeType: getDataSourceNodeMimeType("CONVERSATIONS_FOLDER"),
      });
    }

    const teams = await IntercomTeam.findAll({
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
            mimeType: getDataSourceNodeMimeType("TEAM"),
          });
        }
      },
      { concurrency: 16 }
    );

    // Length = 1, for loop just in case
    const workspaces = await IntercomWorkspace.findAll({
      where: {
        connectorId: connector.id,
      },
    });

    for (const workspace of workspaces) {
      // Length mostly 1
      const helpCenters = await IntercomHelpCenter.findAll({
        where: {
          connectorId: connector.id,
          intercomWorkspaceId: workspace.intercomWorkspaceId,
        },
      });

      for (const helpCenter of helpCenters) {
        // Create Help Center folder
        const helpCenterInternalId = getHelpCenterInternalId(
          connector.id,
          helpCenter.helpCenterId
        );
        console.log(
          `[${connector.id}] -> ${JSON.stringify({ folderId: helpCenterInternalId, parents: [helpCenterInternalId] })}`
        );
        if (execute) {
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: helpCenterInternalId,
            parents: [helpCenterInternalId],
            parentId: null,
            title: helpCenter.name,
            mimeType: getDataSourceNodeMimeType("HELP_CENTER"),
          });
        }

        const collections = await IntercomCollection.findAll({
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
                mimeType: getDataSourceNodeMimeType("COLLECTION"),
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
