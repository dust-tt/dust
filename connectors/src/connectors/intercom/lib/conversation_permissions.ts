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
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
} from "@connectors/types";
import type { ModelId } from "@connectors/types";
import { MIME_TYPES } from "@connectors/types";

export async function allowSyncTeam({
  connectorId,
  connectionId,
  teamId,
}: {
  connectorId: ModelId;
  connectionId: string;
  teamId: string;
}): Promise<IntercomTeamModel> {
  let team = await IntercomTeamModel.findOne({
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
      team = await IntercomTeamModel.create({
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
}): Promise<IntercomTeamModel | null> {
  const team = await IntercomTeamModel.findOne({
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

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
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

  const teamsWithReadPermission = await IntercomTeamModel.findAll({
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
        internalId: allTeamsInternalId,
        parentInternalId: null,
        type: "folder",
        title: `All closed conversations from the past ${conversationsSlidingWindow} days`,
        sourceUrl: null,
        expandable: true,
        preventSelection: false,
        permission: isAllConversationsSynced ? "read" : "none",
        lastUpdatedAt: null,
        mimeType: MIME_TYPES.INTERCOM.TEAMS_FOLDER,
      });
    } else if (isRootLevel && hasTeamsWithReadPermission) {
      nodes.push({
        internalId: allTeamsInternalId,
        parentInternalId: null,
        type: "folder",
        title: `Closed conversations from the past ${conversationsSlidingWindow} days for the selected Teams`,
        sourceUrl: null,
        expandable: true,
        preventSelection: false,
        permission: "read",
        lastUpdatedAt: null,
        mimeType: MIME_TYPES.INTERCOM.TEAMS_FOLDER,
      });
    }

    if (parentInternalId === allTeamsInternalId) {
      teamsWithReadPermission.forEach((team) => {
        nodes.push({
          internalId: getTeamInternalId(connectorId, team.teamId),
          parentInternalId: allTeamsInternalId,
          type: "folder",
          title: team.name,
          sourceUrl: null,
          expandable: false,
          permission: team.permission,
          lastUpdatedAt: null,
          mimeType: MIME_TYPES.INTERCOM.TEAM,
        });
      });
    }
  } else {
    const accessToken = await getIntercomAccessToken(connector.connectionId);
    const teams = await fetchIntercomTeams({ accessToken });
    if (isRootLevel) {
      nodes.push({
        internalId: allTeamsInternalId,
        parentInternalId: null,
        type: "folder",
        title: "Conversations",
        sourceUrl: null,
        expandable: true,
        preventSelection: false,
        permission: isAllConversationsSynced ? "read" : "none",
        lastUpdatedAt: null,
        mimeType: MIME_TYPES.INTERCOM.TEAMS_FOLDER,
      });
    }
    if (parentInternalId === allTeamsInternalId) {
      teams.forEach((team) => {
        const isTeamInDb = teamsWithReadPermission.some((teamFromDb) => {
          return teamFromDb.teamId === team.id;
        });
        nodes.push({
          internalId: getTeamInternalId(connectorId, team.id),
          parentInternalId: allTeamsInternalId,
          type: "folder",
          title: team.name,
          sourceUrl: null,
          expandable: false,
          permission: isTeamInDb ? "read" : "none",
          lastUpdatedAt: null,
          mimeType: MIME_TYPES.INTERCOM.TEAM,
        });
      });
    }
  }
  nodes.sort((a, b) => {
    return a.title.localeCompare(b.title);
  });

  return nodes;
}
