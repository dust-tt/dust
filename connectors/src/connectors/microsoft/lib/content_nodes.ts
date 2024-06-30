import type { ContentNode } from "@dust-tt/types";

import {
  microsoftInternalIdFromNodeData,
  microsoftNodeDataFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";

export function getRootNodes(): ContentNode[] {
  return [getSitesRootAsContentNode(), getTeamsRootAsContentNode()];
}

export function getSitesRootAsContentNode(): ContentNode {
  return {
    provider: "microsoft",
    internalId: "microsoft/sites-root",
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
    internalId: "microsoft/teams-root",
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
      resourcePath: `/teams/${team.id}`,
      nodeType: "team",
      nodeId: team.id,
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
      resourcePath: `/sites/${site.id}`,
      nodeType: "site",
      nodeId: site.id,
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
  const { nodeType, nodeId: teamId } =
    microsoftNodeDataFromInternalId(parentInternalId);
  if (nodeType !== "team") {
    throw new Error(`Invalid parent nodeType: ${nodeType}`);
  }

  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      resourcePath: `/teams/${teamId}/channels/${channel.id}`,
      nodeType: "channel",
      nodeId: channel.id,
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
      resourcePath: `/drives/${drive.id}`,
      nodeType: "drive",
      nodeId: drive.id,
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
  const {
    nodeType,
    nodeId,
    resourcePath: parentResourcePath,
  } = microsoftNodeDataFromInternalId(parentInternalId);

  if (nodeType !== "drive" && nodeType !== "folder") {
    throw new Error(`Invalid parent nodeType: ${nodeType}`);
  }

  const resourcePath =
    nodeType === "drive"
      ? `/drives/${nodeId}/items/${folder.id}`
      : // replace items/${parentFolderId} with items/${folder.id} in parentResourcePath
        parentResourcePath.replace(/items\/[^/]+$/, `items/${folder.id}`);

  return {
    provider: "microsoft",
    internalId: microsoftInternalIdFromNodeData({
      resourcePath,
      nodeType: "folder",
      nodeId: folder.id,
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
