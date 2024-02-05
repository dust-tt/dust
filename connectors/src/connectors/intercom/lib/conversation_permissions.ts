import type { ConnectorResource } from "@dust-tt/types";
import type { Client as IntercomClient } from "intercom-client";

import {
  fetchIntercomTeam,
  fetchIntercomTeams,
  getIntercomClient,
} from "@connectors/connectors/intercom/lib/intercom_api";
import { getTeamInternalId } from "@connectors/connectors/intercom/lib/utils";
import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { Connector } from "@connectors/lib/models";
import { IntercomTeam } from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";

export async function allowSyncTeam({
  connector,
  intercomClient,
  teamId,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  teamId: string;
}): Promise<IntercomTeam> {
  let team = await IntercomTeam.findOne({
    where: {
      connectorId: connector.id,
      teamId: teamId,
    },
  });
  if (team?.permission === "none") {
    await team.update({
      permission: "read",
    });
  }
  if (!team) {
    const teamOnIntercom = await fetchIntercomTeam(intercomClient, teamId);
    if (teamOnIntercom) {
      team = await IntercomTeam.create({
        connectorId: connector.id,
        teamId: teamOnIntercom.id,
        name: teamOnIntercom.name,
        permission: "read",
      });
    }
  }

  if (!team) {
    logger.error(
      { connector, teamId },
      "[Intercom] Failed to sync team. Team not found."
    );
    throw new Error("Team not found.");
  }

  return team;
}

export async function revokeSyncTeam({
  connector,
  teamId,
}: {
  connector: Connector;
  teamId: string;
}): Promise<IntercomTeam | null> {
  const team = await IntercomTeam.findOne({
    where: {
      connectorId: connector.id,
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
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<ConnectorResource[]> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    throw new Error("Connector not found");
  }

  const intercomClient = await getIntercomClient(connector.connectionId);
  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  let resources: ConnectorResource[] = [];

  // If Root level we retrieve the list of Help Centers.
  // If isReadPermissionsOnly = true, we retrieve the list of Teams from DB that have permission = "read"
  // If isReadPermissionsOnly = false, we retrieve the list of Teams from Intercom
  if (isRootLevel) {
    const teamsFromDb = await IntercomTeam.findAll({
      where: {
        connectorId: connectorId,
        permission: "read",
      },
    });

    if (isReadPermissionsOnly) {
      resources = teamsFromDb.map((team) => ({
        provider: connector.type,
        internalId: getTeamInternalId(connectorId, team.teamId),
        parentInternalId: null,
        type: "channel",
        title: team.name,
        sourceUrl: null,
        expandable: false,
        permission: team.permission,
        dustDocumentId: null,
        lastUpdatedAt: null,
      }));
    } else {
      const teams = await fetchIntercomTeams(intercomClient);
      resources = teams.map((team) => {
        const isTeamInDb = teamsFromDb.some((teamFromDb) => {
          return teamFromDb.teamId === team.id;
        });
        return {
          provider: connector.type,
          internalId: getTeamInternalId(connectorId, team.id),
          parentInternalId: null,
          type: "channel",
          title: team.name,
          sourceUrl: null,
          expandable: false,
          permission: isTeamInDb ? "read" : "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        };
      });
    }
    resources.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
  }
  return resources;
}
