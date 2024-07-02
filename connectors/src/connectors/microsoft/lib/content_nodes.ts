import type { ContentNode } from "@dust-tt/types";

import {
  getDriveItemApiPath,
  microsoftInternalIdFromNodeData,
  microsoftNodeDataFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";

export function getRootNodes(): ContentNode[] {
  return [getSitesRootAsContentNode(), getTeamsRootAsContentNode()];
}

export function getSitesRootAsContentNode(): ContentNode {
  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: "",
      nodeType: "sites-root",
    }),
    parentInternalId: null,
    type: "folder",
    title: "Sites",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
  };
}

export function getTeamsRootAsContentNode(): ContentNode {
  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: "",
      nodeType: "teams-root",
    }),
    parentInternalId: null,
    type: "folder",
    title: "Teams",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
  };
}
export function getTeamAsContentNode(team: microsoftgraph.Team): ContentNode {
  if (!team.id) {
    // Unexpected, unreachable
    throw new Error("Team id is required");
  }

  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: `/teams/${team.id}`,
      nodeType: "team",
    }),
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

export function getSiteAsContentNode(site: microsoftgraph.Site): ContentNode {
  if (!site.id) {
    // Unexpected, unreachable
    throw new Error("Site id is required");
  }
  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: `/sites/${site.id}`,
      nodeType: "site",
    }),
    parentInternalId: null,
    type: "folder",
    title: site.displayName || site.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
  };
}

export function getChannelAsContentNode(
  channel: microsoftgraph.Channel,
  parentInternalId: string
): ContentNode {
  if (!channel.id) {
    // Unexpected, unreachable
    throw new Error("Channel id is required");
  }
  const { nodeType, itemApiPath: parentItemApiPath } =
    microsoftNodeDataFromInternalId(parentInternalId);
  if (nodeType !== "team") {
    throw new Error(`Invalid parent nodeType: ${nodeType}`);
  }

  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: `${parentItemApiPath}/channels/${channel.id}`,
      nodeType: "channel",
    }),
    parentInternalId,
    type: "channel",
    title: channel.displayName || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: false,
    permission: "none",
  };
}

export function getDriveAsContentNode(
  drive: microsoftgraph.Drive,
  parentInternalId: string
): ContentNode {
  if (!drive.id) {
    // Unexpected, unreachable
    throw new Error("Drive id is required");
  }
  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: `/drives/${drive.id}`,
      nodeType: "drive",
    }),
    parentInternalId,
    type: "folder",
    title: drive.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
  };
}
export function getFolderAsContentNode(
  folder: microsoftgraph.DriveItem,
  parentInternalId: string
): ContentNode {
  if (!folder.id) {
    // Unexpected, unreachable
    throw new Error("Folder id is required");
  }

  const resourcePath = getDriveItemApiPath(folder, parentInternalId);
  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      itemApiPath: resourcePath,
      nodeType: "folder",
    }),
    parentInternalId,
    type: "folder",
    title: folder.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
  };
}
