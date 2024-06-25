import type { ContentNode } from "@dust-tt/types";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/node_types";
import { isValidNodeType } from "@connectors/connectors/microsoft/lib/node_types";

export function splitId(internalId: string): [MicrosoftNodeType, string] {
  const [resourceType, ...rest] = internalId.split("/");

  if (!resourceType || !isValidNodeType(resourceType)) {
    throw new Error(`Invalid internalId: ${internalId}`);
  }

  return [resourceType, rest.join("/")];
}

export function getRootNodes(): ContentNode[] {
  return [getSitesRootAsContentNode(), getTeamsRootAsContentNode()];
}

export function getSitesRootAsContentNode(): ContentNode {
  return {
    provider: "microsoft",
    internalId: "sites-root",
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
    internalId: "teams-root",
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
    internalId: `team/${team.id}`,
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
  return {
    provider: "microsoft",
    internalId: `site/${site.id}`,
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
  return {
    provider: "microsoft",
    internalId: `channel/${channel.id}`,
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
  return {
    provider: "microsoft",
    internalId: `drive/${drive.id}`,
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
  const [, parentId] = splitId(parentInternalId);
  const [driveId] = parentId.split("/");

  return {
    provider: "microsoft",
    internalId: `folder/${driveId}/${folder.id}`,
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
