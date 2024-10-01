import type { ContentNode, ModelId } from "@dust-tt/types";

import {
  getHelpCenterCollectionInternalId,
  getHelpCenterInternalId,
  getTeamInternalId,
  getTeamsInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import {
  IntercomCollection,
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

/**
 * Retrieve all selected nodes by the admin when setting permissions.
 * For intercom, the admin can set:
 * - the top collections (= collections without parentId)
 * - all teams (conversations are stored in Teams)
 * - a specific team
 */
export async function retrieveSelectedNodes({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<ContentNode[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    throw new Error("Connector not found");
  }

  const collections = await IntercomCollection.findAll({
    where: {
      connectorId: connectorId,
      permission: "read",
    },
  });
  const collectionsNodes: ContentNode[] = [];

  collections.map((collection) => {
    if (collection.parentId) {
      // We display only level 1 collections cause selection is limited to level 1 on permission modal.
      return;
    }
    const expandable = collections.some(
      (c) => c.parentId === collection.collectionId
    );

    collectionsNodes.push({
      provider: connector.type,
      internalId: getHelpCenterCollectionInternalId(
        connectorId,
        collection.collectionId
      ),
      parentInternalId: getHelpCenterInternalId(
        connectorId,
        collection.helpCenterId
      ),
      type: "folder",
      title: collection.name,
      sourceUrl: collection.url,
      expandable,
      permission: collection.permission,
      dustDocumentId: null,
      lastUpdatedAt: collection.updatedAt.getTime() || null,
    });
  });

  const teamsNodes: ContentNode[] = [];

  const intercomWorkspace = await IntercomWorkspace.findOne({
    where: { connectorId },
  });
  if (
    intercomWorkspace?.syncAllConversations === "activated" ||
    intercomWorkspace?.syncAllConversations === "scheduled_activate"
  ) {
    teamsNodes.push({
      provider: connector.type,
      internalId: getTeamsInternalId(connectorId),
      parentInternalId: null,
      type: "channel",
      title: "Conversations",
      sourceUrl: null,
      expandable: false,
      permission: "read",
      dustDocumentId: null,
      lastUpdatedAt: null,
    });
  }

  const teams = await IntercomTeam.findAll({
    where: {
      connectorId: connectorId,
      permission: "read",
    },
  });
  teams.forEach((team) => {
    teamsNodes.push({
      provider: connector.type,
      internalId: getTeamInternalId(connectorId, team.teamId),
      parentInternalId: getTeamsInternalId(connectorId),
      type: "folder",
      title: team.name,
      sourceUrl: null,
      expandable: false,
      permission: team.permission,
      dustDocumentId: null,
      lastUpdatedAt: team.updatedAt.getTime() || null,
    });
  });

  return [...collectionsNodes, ...teamsNodes];
}
