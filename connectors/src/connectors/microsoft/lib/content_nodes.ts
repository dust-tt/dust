import type { ContentNode, ContentNodeType } from "@dust-tt/types";

import {
  getDriveInternalId,
  getDriveItemInternalId,
  getSiteAPIPath,
  internalIdFromTypeAndPath,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";

export function getRootNodes(): ContentNode[] {
  return [getSitesRootAsContentNode(), getTeamsRootAsContentNode()];
}

export function getSitesRootAsContentNode(): ContentNode {
  return {
    provider: "microsoft",
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: "",
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
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: "",
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
  return {
    provider: "microsoft",
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: `/teams/${team.id}`,
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
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: getSiteAPIPath(site),
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
  const { nodeType } = typeAndPathFromInternalId(parentInternalId);
  if (nodeType !== "team") {
    throw new Error(`Invalid parent nodeType: ${nodeType}`);
  }

  return {
    provider: "microsoft",
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: `/teams/${parentInternalId}/channels/${channel.id}`,
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
    internalId: getDriveInternalId(drive),
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
  return {
    provider: "microsoft",
    internalId: getDriveItemInternalId(folder),
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

export function getFileAsContentNode(
  file: microsoftgraph.DriveItem,
  parentInternalId: string
): ContentNode {
  return {
    provider: "microsoft",
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: getDriveItemAPIPath(file),
      nodeType: "folder",
    }),
    parentInternalId,
    type: "file",
    title: file.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: false,
    permission: "none",
  };
}

export function getMicrosoftNodeAsContentNode(
  node: MicrosoftNodeModel,
  expandWorksheet: boolean
): ContentNode {
  // When table picking we want spreadsheets to expand to select the different
  // sheets. While extracting data we want to treat them as regular files.
  const isExpandable =
    !node.mimeType ||
    (node.mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
      expandWorksheet);
  let type: ContentNodeType;
  if (["drive", "folder"].includes(node.nodeType)) {
    type = "folder";
  } else if (node.nodeType === "worksheet") {
    type = expandWorksheet ? "database" : "file";
  } else if (node.nodeType === "file") {
    type = node.nodeType;
  } else {
    throw new Error(`Unsupported nodeType ${node.nodeType}.`);
  }
  return {
    provider: "microsoft",
    internalId: node.internalId,
    parentInternalId: node.parentInternalId,
    type,
    title: node.name || "unnamed",
    sourceUrl: "",
    dustDocumentId: null,
    lastUpdatedAt: null,
    expandable: isExpandable,
    permission: "none",
  };
}
