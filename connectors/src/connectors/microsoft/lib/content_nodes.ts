import {
  getDriveInternalId,
  getDriveItemInternalId,
  getListInternalId,
  getSiteAPIPath,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { internalIdFromTypeAndPath } from "@connectors/connectors/microsoft/lib/utils";
import type { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import type { ContentNode, ContentNodeType } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";
import { assertNever } from "@dust-tt/client";
import type { Drive, List, Site } from "@microsoft/microsoft-graph-types";

export function getRootNodes(): ContentNode[] {
  return [getSitesRootAsContentNode()];
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

export function getListAsContentNode(
  list: List,
  parentInternalId: string,
  siteItemAPIPath: string
): ContentNode {
  return {
    internalId: getListInternalId(list, siteItemAPIPath),
    parentInternalId,
    // A SharePoint list is a single structured table (unlike an Excel file which
    // expands to several worksheets), so it is a directly-selectable leaf.
    type: "table",
    title: list.displayName || list.name || "unnamed",
    sourceUrl: list.webUrl ?? null,
    lastUpdatedAt: null,
    expandable: false,
    permission: "none",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.LIST,
  };
}

export function getMicrosoftNodeAsContentNode(
  node: MicrosoftNodeResource,
  expandWorksheet: boolean
): ContentNode {
  // A SharePoint list is a single leaf table. Spreadsheets expand into their
  // worksheets, but only while table-picking; otherwise treat them as files.
  const isExpandable =
    node.nodeType !== "list" &&
    (!node.mimeType ||
      (node.mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
        expandWorksheet));
  let type: ContentNodeType;
  let mimeType: string;
  switch (node.nodeType) {
    case "drive":
    case "folder":
      type = "folder";
      mimeType = INTERNAL_MIME_TYPES.MICROSOFT.FOLDER;
      break;
    case "worksheet":
      type = expandWorksheet ? "table" : "document";
      mimeType =
        type === "table"
          ? INTERNAL_MIME_TYPES.MICROSOFT.SPREADSHEET
          : node.mimeType || INTERNAL_MIME_TYPES.MICROSOFT.FOLDER;
      break;
    case "list":
      type = "table";
      mimeType = INTERNAL_MIME_TYPES.MICROSOFT.LIST;
      break;
    case "file":
      type = "document";
      mimeType = node.mimeType || INTERNAL_MIME_TYPES.MICROSOFT.FOLDER;
      break;
    case "sites-root":
    case "site":
    case "page":
    case "message":
      throw new Error(`Unsupported nodeType ${node.nodeType}.`);
    default:
      assertNever(node.nodeType);
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
    mimeType,
  };
}
