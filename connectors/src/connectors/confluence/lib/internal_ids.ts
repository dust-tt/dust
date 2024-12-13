/**
Naming conventions:
- Confluence ID: The ID that Confluence uses to identify a space or page, usually just a number.
- Internal ID: The ID we use in content nodes and in data_source_documents (both document_id and parents).
Internal IDs are Confluence IDs with a prefix `confluence-space-` or `confluence-page-`.
 */

enum ConfluenceInternalIdPrefix {
  Space = "confluence-space-",
  Page = "confluence-page-",
}

export function makeSpaceInternalId(confluenceSpaceId: string) {
  return `${ConfluenceInternalIdPrefix.Space}${confluenceSpaceId}`;
}

export function makePageInternalId(confluencePageId: string) {
  return `${ConfluenceInternalIdPrefix.Page}${confluencePageId}`;
}

export function getConfluenceIdFromInternalId(internalId: string) {
  if (isInternalPageId(internalId) || isInternalSpaceId(internalId)) {
    const prefixPattern = `^(${ConfluenceInternalIdPrefix.Space}|${ConfluenceInternalIdPrefix.Page})`;
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
