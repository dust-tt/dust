enum ConfluenceInternalIdPrefix {
  Space = "space_",
  Page = "page_",
}

export function makeConfluenceInternalSpaceId(confluenceSpaceId: string) {
  return `${ConfluenceInternalIdPrefix.Space}${confluenceSpaceId}`;
}

export function makeConfluenceInternalPageId(confluencePageId: string) {
  return `${ConfluenceInternalIdPrefix.Page}${confluencePageId}`;
}

export function getIdFromConfluenceInternalId(internalId: string) {
  const prefixPattern = `^(${ConfluenceInternalIdPrefix.Space}|${ConfluenceInternalIdPrefix.Page})`;
  return internalId.replace(new RegExp(prefixPattern), "");
}

export function isConfluenceInternalSpaceId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Space}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Space);
}

export function isConfluenceInternalPageId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Page}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Page);
}
