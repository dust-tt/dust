import type { ContentNode, ModelId } from "@dust-tt/types";

import {
  fetchIntercomTeam,
  fetchIntercomTeams,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  getAllConversationsInternalId,
  getTeamInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import {
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function allowSyncTeam({
  connectorId,
  connectionId,
  teamId,
}: {
  connectorId: ModelId;
  connectionId: string;
  teamId: string;
}): Promise<IntercomTeam> {
  let team = await IntercomTeam.findOne({
    where: {
      connectorId,
      teamId,
    },
  });
  if (team?.permission === "none") {
    await team.update({
      permission: "read",
    });
  }
  if (!team) {
    const teamOnIntercom = await fetchIntercomTeam(connectionId, teamId);
    if (teamOnIntercom) {
      team = await IntercomTeam.create({
        connectorId,
        teamId: teamOnIntercom.id,
        name: teamOnIntercom.name,
        permission: "read",
      });
    }
  }

  if (!team) {
    logger.error(
      { connectorId, connectionId, teamId },
      "[Intercom] Failed to sync team. Team not found."
    );
    throw new Error("Team not found.");
  }

  return team;
}

export async function revokeSyncTeam({
  connectorId,
  teamId,
}: {
  connectorId: ModelId;
  teamId: string;
}): Promise<IntercomTeam | null> {
  const team = await IntercomTeam.findOne({
    where: {
      connectorId,
      teamId: teamId,
    },
  });
  if (team?.permission === "read") {
    await team.update({
      permission: "none",
    });
  }
  return team;
}

export async function retrieveIntercomConversationsPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<ContentNode[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    throw new Error("Connector not found");
  }

  const intercomWorkspace = await IntercomWorkspace.findOne({
    where: { connectorId },
  });
  if (!intercomWorkspace) {
    logger.error({ connectorId }, "[Intercom] IntercomWorkspace not found.");
    throw new Error("IntercomWorkspace not found");
  }

  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  const allConvosInternalId = getAllConversationsInternalId(connectorId);
  const nodes: ContentNode[] = [];

  const rootConversationNode: ContentNode = {
    provider: "intercom",
    internalId: allConvosInternalId,
    parentInternalId: null,
    type: "channel",
    title: "Conversations",
    sourceUrl: null,
    expandable: true,
    preventSelection: false,
    permission:
      intercomWorkspace.syncAllConversations === "activated" ? "read" : "none",
    dustDocumentId: null,
    lastUpdatedAt: null,
  };

  const teamsWithReadPermission = await IntercomTeam.findAll({
    where: {
      connectorId: connectorId,
      permission: "read",
    },
  });

  // If Root level we display the fake parent "Conversations"
  // If isReadPermissionsOnly = true, we retrieve the list of Teams from DB that have permission = "read"
  // If isReadPermissionsOnly = false, we retrieve the list of Teams from Intercom
  if (isReadPermissionsOnly) {
    if (isRootLevel && teamsWithReadPermission.length > 0) {
      nodes.push(rootConversationNode);
    }
    if (parentInternalId === allConvosInternalId) {
      teamsWithReadPermission.forEach((team) => {
        nodes.push({
          provider: connector.type,
          internalId: getTeamInternalId(connectorId, team.teamId),
          parentInternalId: allConvosInternalId,
          type: "folder",
          title: team.name,
          sourceUrl: null,
          expandable: false,
          permission: team.permission,
          dustDocumentId: null,
          lastUpdatedAt: null,
        });
      });
    }
  } else {
    const teams = await fetchIntercomTeams(connector.connectionId);
    if (isRootLevel) {
      nodes.push(rootConversationNode);
    }
    if (parentInternalId === allConvosInternalId) {
      teams.forEach((team) => {
        const isTeamInDb = teamsWithReadPermission.some((teamFromDb) => {
          return teamFromDb.teamId === team.id;
        });
        nodes.push({
          provider: connector.type,
          internalId: getTeamInternalId(connectorId, team.id),
          parentInternalId: allConvosInternalId,
          type: "folder",
          title: team.name,
          sourceUrl: null,
          expandable: false,
          permission: isTeamInDb ? "read" : "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        });
      });
    }
  }
  nodes.sort((a, b) => {
    return a.title.localeCompare(b.title);
  });

  return nodes;
}
