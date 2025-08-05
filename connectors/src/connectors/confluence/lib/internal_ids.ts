/**
 * Naming conventions:
 * - Confluence ID: ID that Confluence uses to identify a space, page or folder, usually just a
 * number.
 * - Internal ID: The ID we use in content nodes and in data_source_documents (both document_id
 * and parents).
 * Internal IDs are Confluence IDs with a prefix: `confluence-space-`, `confluence-page-` or
 * `confluence-folder-`.
 */

import { assertNever } from "@dust-tt/client";

enum ConfluenceInternalIdPrefix {
  Folder = "confluence-folder-",
  Page = "confluence-page-",
  Space = "confluence-space-",
}

export function makeSpaceInternalId(confluenceSpaceId: string) {
  return `${ConfluenceInternalIdPrefix.Space}${confluenceSpaceId}`;
}

export function makePageInternalId(confluencePageId: string) {
  return `${ConfluenceInternalIdPrefix.Page}${confluencePageId}`;
}

export function makeFolderInternalId(confluenceFolderId: string) {
  return `${ConfluenceInternalIdPrefix.Folder}${confluenceFolderId}`;
}

export function makeParentInternalId(
  parentType: "page" | "folder",
  parentId: string
) {
  switch (parentType) {
    case "page":
      return makePageInternalId(parentId);

    case "folder":
      return makeFolderInternalId(parentId);

    default:
      assertNever(parentType);
  }
}

export function getConfluenceIdFromInternalId(internalId: string) {
  if (
    isInternalPageId(internalId) ||
    isInternalSpaceId(internalId) ||
    isInternalFolderId(internalId)
  ) {
    const prefixPattern = `^(${ConfluenceInternalIdPrefix.Space}|${ConfluenceInternalIdPrefix.Page}|${ConfluenceInternalIdPrefix.Folder})`;
    return internalId.replace(new RegExp(prefixPattern), "");
  }
  throw new Error(`Invalid internal ID: ${internalId}`);
}

export function isInternalSpaceId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Space}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Space);
}

export function isInternalPageId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Page}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Page);
}

export function isInternalFolderId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Folder}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Folder);
}
