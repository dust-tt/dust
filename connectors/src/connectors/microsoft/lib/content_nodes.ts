import type {
  Channel,
  Drive,
  Site,
  Team,
} from "@microsoft/microsoft-graph-types";

import {
  getDriveInternalId,
  getDriveItemInternalId,
  getSiteAPIPath,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import {
  internalIdFromTypeAndPath,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import type { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import type { ContentNode, ContentNodeType } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

export function getRootNodes(): ContentNode[] {
  return [getSitesRootAsContentNode(), getTeamsRootAsContentNode()];
}

export function getSitesRootAsContentNode(): ContentNode {
  return {
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: "",
      nodeType: "sites-root",
    }),
    parentInternalId: null,
    type: "folder",
    title: "Sites",
    sourceUrl: null,
    lastUpdatedAt: null,
    preventSelection: true,
    expandable: true,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}

export function getTeamsRootAsContentNode(): ContentNode {
  return {
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: "",
      nodeType: "teams-root",
    }),
    parentInternalId: null,
    type: "folder",
    title: "Teams",
    sourceUrl: null,
    lastUpdatedAt: null,
    preventSelection: true,
    expandable: true,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}
export function getTeamAsContentNode(team: Team): ContentNode {
  return {
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: `/teams/${team.id}`,
      nodeType: "team",
    }),
    parentInternalId: null,
    type: "folder",
    title: team.displayName || "unnamed",
    sourceUrl: team.webUrl ?? null,
    lastUpdatedAt: null,
    preventSelection: true,
    expandable: true,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}

export function getSiteAsContentNode(
  site: Site,
  parentInternalId?: string
): ContentNode {
  if (!site.id) {
    // Unexpected, unreachable
    throw new Error("Site id is required");
  }
  return {
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: getSiteAPIPath(site),
      nodeType: "site",
    }),
    parentInternalId: parentInternalId || null,
    type: "folder",
    title: site.displayName || site.name || "unnamed",
    sourceUrl: site.webUrl ?? null,
    lastUpdatedAt: null,
    preventSelection: true,
    expandable: true,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}

export function getChannelAsContentNode(
  channel: Channel,
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
  // Extract the team GUID from the parent team internal ID
  const teamGuid =
    typeAndPathFromInternalId(parentInternalId).itemAPIPath.split("/")[2];

  return {
    internalId: internalIdFromTypeAndPath({
      itemAPIPath: `/teams/${teamGuid}/channels/${channel.id}`,
      nodeType: "channel",
    }),
    parentInternalId,
    type: "folder",
    title: channel.displayName || "unnamed",
    sourceUrl: channel.webUrl ?? null,
    lastUpdatedAt: null,
    expandable: false,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}

export function getDriveAsContentNode(
  drive: Drive,
  parentInternalId: string
): ContentNode {
  if (!drive.id) {
    // Unexpected, unreachable
    throw new Error("Drive id is required");
  }
  return {
    internalId: getDriveInternalId(drive),
    parentInternalId,
    type: "folder",
    title: drive.name || "unnamed",
    sourceUrl: drive.webUrl ?? null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}
export function getFolderAsContentNode(
  folder: DriveItem,
  parentInternalId: string
): ContentNode {
  return {
    internalId: getDriveItemInternalId(folder),
    parentInternalId,
    type: "folder",
    title: folder.name || "unnamed",
    sourceUrl: folder.webUrl ?? null,
    lastUpdatedAt: null,
    expandable: true,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}

export function getMicrosoftNodeAsContentNode(
  node: MicrosoftNodeResource,
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
  if (["drive", "folder", "team", "channel"].includes(node.nodeType)) {
    type = "folder";
  } else if (node.nodeType === "worksheet") {
    type = expandWorksheet ? "table" : "document";
  } else if (["file", "message"].includes(node.nodeType)) {
    type = "document";
  } else {
    throw new Error(`Unsupported nodeType ${node.nodeType}.`);
  }

  return {
    internalId: node.internalId,
    parentInternalId: node.parentInternalId,
    type,
    title: node.name || "unnamed",
    sourceUrl: node.webUrl ?? null,
    lastUpdatedAt: null,
    expandable: isExpandable,
    permission: "none",
    mimeType:
      type === "table"
        ? INTERNAL_MIME_TYPES.MICROSOFT.SPREADSHEET
        : type === "folder"
          ? INTERNAL_MIME_TYPES.MICROSOFT.FOLDER
          : node.mimeType || INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
  };
}
