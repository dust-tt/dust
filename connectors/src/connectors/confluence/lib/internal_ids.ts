enum ConfluenceInternalIdPrefix {
  Space = "space_",
  Page = "page_",
}

export function makeConfluencePublicSpaceId(confluenceSpaceId: string) {
  return `${ConfluenceInternalIdPrefix.Space}${confluenceSpaceId}`;
}

export function makeConfluencePublicPageId(confluencePageId: string) {
  return `${ConfluenceInternalIdPrefix.Page}${confluencePageId}`;
}

export function getIdFromConfluencePublicId(internalId: string) {
  const prefixPattern = `^(${ConfluenceInternalIdPrefix.Space}|${ConfluenceInternalIdPrefix.Page})`;
  return internalId.replace(new RegExp(prefixPattern), "");
}

export function isConfluencePublicSpaceId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Space}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Space);
}

export function isConfluencePublicPageId(
  internalId: string
): internalId is `${ConfluenceInternalIdPrefix.Page}${string}` {
  return internalId.startsWith(ConfluenceInternalIdPrefix.Page);
}
