enum ConfluenceInternalIdPrefix {
  Space = "space_",
  Page = "page_",
}

export function makeConfluenceInternalSpaceId(spaceId: string) {
  return `${ConfluenceInternalIdPrefix.Space}${spaceId}`;
}

export function makeConfluenceInternalPageId(pageId: number) {
  return `${ConfluenceInternalIdPrefix.Page}${pageId}`;
}

export function getIdFromConfluenceInternalId(internalId: string) {
  const prefixPattern = `^(${ConfluenceInternalIdPrefix.Space}|${ConfluenceInternalIdPrefix.Page})`;
  const id = internalId.replace(new RegExp(prefixPattern), "");

  const parsedInt = parseInt(id, 10);
  return isNaN(parsedInt) ? null : parsedInt;
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
