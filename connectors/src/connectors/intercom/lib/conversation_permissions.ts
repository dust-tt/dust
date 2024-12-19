import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import {
  fetchIntercomTeam,
  fetchIntercomTeams,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  getTeamInternalId,
  getTeamsInternalId,
} from "@connectors/connectors/intercom/lib/utils";
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
    const accessToken = await getIntercomAccessToken(connectionId);
    const teamOnIntercom = await fetchIntercomTeam({ accessToken, teamId });
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
}: {
  connectorId: ModelId;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  viewType: ContentNodesViewType;
}): Promise<ContentNode[]> {
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
  const allTeamsInternalId = getTeamsInternalId(connectorId);
  const nodes: ContentNode[] = [];

  const teamsWithReadPermission = await IntercomTeam.findAll({
    where: {
      connectorId: connectorId,
      permission: "read",
    },
  });

  // If Root level we display the fake parent "Conversations"
  // If isReadPermissionsOnly = true, we retrieve the list of Teams from DB that have permission = "read"
  // If isReadPermissionsOnly = false, we retrieve the list of Teams from Intercom
  const isAllConversationsSynced =
    intercomWorkspace.syncAllConversations === "activated";
  const hasTeamsWithReadPermission = teamsWithReadPermission.length > 0;
  const conversationsSlidingWindow =
    intercomWorkspace.conversationsSlidingWindow;

  if (isReadPermissionsOnly) {
    if (isRootLevel && isAllConversationsSynced) {
      nodes.push({
        provider: "intercom",
        internalId: allTeamsInternalId,
        parentInternalId: null,
        type: "channel",
        title: `All closed conversations from the past ${conversationsSlidingWindow} days`,
        sourceUrl: null,
        expandable: false,
        preventSelection: false,
        permission: isAllConversationsSynced ? "read" : "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      });
    } else if (isRootLevel && hasTeamsWithReadPermission) {
      nodes.push({
        provider: "intercom",
        internalId: allTeamsInternalId,
        parentInternalId: null,
        type: "channel",
        title: `Closed conversations from the past ${conversationsSlidingWindow} days for the selected Teams`,
        sourceUrl: null,
        expandable: true,
        preventSelection: false,
        permission: "read",
        dustDocumentId: null,
        lastUpdatedAt: null,
      });
    }

    if (parentInternalId === allTeamsInternalId) {
      teamsWithReadPermission.forEach((team) => {
        nodes.push({
          provider: connector.type,
          internalId: getTeamInternalId(connectorId, team.teamId),
          parentInternalId: allTeamsInternalId,
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
    const accessToken = await getIntercomAccessToken(connector.connectionId);
    const teams = await fetchIntercomTeams({ accessToken });
    if (isRootLevel) {
      nodes.push({
        provider: "intercom",
        internalId: allTeamsInternalId,
        parentInternalId: null,
        type: "channel",
        title: "Conversations",
        sourceUrl: null,
        expandable: true,
        preventSelection: false,
        permission: isAllConversationsSynced ? "read" : "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      });
    }
    if (parentInternalId === allTeamsInternalId) {
      teams.forEach((team) => {
        const isTeamInDb = teamsWithReadPermission.some((teamFromDb) => {
          return teamFromDb.teamId === team.id;
        });
        nodes.push({
          provider: connector.type,
          internalId: getTeamInternalId(connectorId, team.id),
          parentInternalId: allTeamsInternalId,
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
