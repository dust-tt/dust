import type { ContentNode } from "@dust-tt/types";

import type { MsConnectorType } from "@connectors/connectors/microsoft";

export function getTeamAsContentNode(
  team: microsoftgraph.Team,
  connectorType: MsConnectorType
): ContentNode {
  return {
    provider: connectorType,
    internalId: `team-${team.id}`,
    parentInternalId: null,
    type: "folder",
    title: team.displayName || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
  };
}

export function getSiteAsContentNode(
  site: microsoftgraph.Site,
  connectorType: MsConnectorType
): ContentNode {
  return {
    provider: connectorType,
    internalId: `site-${site.id}`,
    parentInternalId: null,
    type: "folder",
    title: site.displayName || site.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "read",
  };
}

export function getChannelAsContentNode(
  channel: microsoftgraph.Channel,
  parentInternalId: string,
  connectorType: MsConnectorType
): ContentNode {
  return {
    provider: connectorType,
    internalId: `channel-${channel.id}`,
    parentInternalId,
    type: "channel",
    title: channel.displayName || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: false,
    permission: "read",
  };
}

export function getDriveAsContentNode(
  drive: microsoftgraph.Drive,
  parentInternalId: string,
  connectorType: MsConnectorType
): ContentNode {
  return {
    provider: connectorType,
    internalId: `drive-${drive.id}`,
    parentInternalId,
    type: "folder",
    title: drive.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "read",
  };
}
export function getFolderAsContentNode(
  folder: microsoftgraph.DriveItem,
  parentInternalId: string,
  connectorType: MsConnectorType
): ContentNode {
  return {
    provider: connectorType,
    internalId: `site-${folder.id}`,
    parentInternalId,
    type: "folder",
    title: folder.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "read",
  };
}
