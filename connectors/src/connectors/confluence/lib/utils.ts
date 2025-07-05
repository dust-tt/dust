export function extractConfluenceIdsFromUrl(
  url: string
): { spaceKey: string; pageId: string } | null {
  const regex = /\/wiki\/spaces\/([^/]+)\/pages\/(\d+)/;
  const match = url.match(regex);
  if (!match || match.length < 3) {
    return null;
  }

  return {
    spaceKey: match[1]!,
    pageId: match[2]!,
  };
}
