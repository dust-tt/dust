import type { DataSourceViewContentNode } from "@app/types";

const SHAREPOINT_SITE_NAME_REGEX =
  /^https?:\/\/[^/]*sharepoint\.[^/]+\/(?::f:\/r\/)?(?:sites|teams)\/([^/?#]+)/i;

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

type MicrosoftSharePointDisplayTitleOptions = {
  disambiguate?: boolean;
};

export function getMicrosoftSharePointDisplayTitle(
  node: DataSourceViewContentNode,
  { disambiguate }: MicrosoftSharePointDisplayTitleOptions = {}
): string {
  if (node.type !== "folder" || !node.sourceUrl) {
    return node.title;
  }

  const shouldPrefix = disambiguate === true || node.parentInternalId === null;
  if (!shouldPrefix) {
    return node.title;
  }

  const siteName = extractSharePointSiteNameFromSourceUrl(node.sourceUrl);
  return siteName ? `${siteName} → ${node.title}` : node.title;
}
