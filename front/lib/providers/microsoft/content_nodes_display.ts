import type { DataSourceViewContentNode } from "@app/types";

const SHAREPOINT_SITE_NAME_REGEX =
  /^https?:\/\/[^/]*sharepoint\.com\/(?::f:\/r\/)?(?:sites|teams)\/([^/?#]+)/i;

function extractSharePointSiteNameFromSourceUrl(
  sourceUrl: string
): string | null {
  const match = sourceUrl.match(SHAREPOINT_SITE_NAME_REGEX);
  const encodedSiteName = match?.[1];
  if (!encodedSiteName) {
    return null;
  }

  try {
    return decodeURIComponent(encodedSiteName);
  } catch {
    // decodeURIComponent throws URIError for malformed escape sequences.
    return encodedSiteName;
  }
}

export function getMicrosoftSharePointRootFolderDisplayTitle(
  node: DataSourceViewContentNode
): string {
  if (
    node.type !== "folder" ||
    node.parentInternalId !== null ||
    !node.sourceUrl
  ) {
    return node.title;
  }

  const siteName = extractSharePointSiteNameFromSourceUrl(node.sourceUrl);
  return siteName ? `${siteName} → ${node.title}` : node.title;
}
