import { hash as blake3 } from "blake3";
import dns from "dns";

import type {
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import type { ContentNodeType } from "@connectors/types";

// Generate a stable id for a given url and ressource type
// That way we don't have to send URL as documentId to the front API.
export function stableIdForUrl({
  url,
  ressourceType,
}: {
  url: string;
  ressourceType: ContentNodeType;
}) {
  // LEGACY, due to a renaming of content node types, but ids must remain stable
  const typePrefix =
    ressourceType === "document"
      ? "file"
      : ressourceType === "table"
        ? "database"
        : "folder";
  return Buffer.from(blake3(`${typePrefix}-${url}`)).toString("hex");
}

export function getParentsForPage(url: string, pageInItsOwnFolder: boolean) {
  const parents: string[] = [];
  parents.push(stableIdForUrl({ url, ressourceType: "document" }));
  if (pageInItsOwnFolder) {
    parents.push(
      stableIdForUrl({ url: normalizeFolderUrl(url), ressourceType: "folder" })
    );
  }
  parents.push(
    ...getAllFoldersForUrl(url).map((f) =>
      stableIdForUrl({ url: f, ressourceType: "folder" })
    )
  );

  return parents;
}

// Returns all parent folders for a given url
// eg: https://example.com/a/b/c -> [https://example.com/a/b, https://example.com/a, https://example.com/]
export function getAllFoldersForUrl(url: string) {
  const parents: string[] = [];

  let parent: string | null = null;
  while ((parent = getFolderForUrl(url))) {
    parents.push(parent);
    url = parent;
  }

  return parents;
}

// Returns the parent folder for a given url
// eg: https://example.com/foo/bar -> https://example.com/foo
// eg: https://example.com/foo -> https://example.com/
export function getFolderForUrl(url: string) {
  const normalized = normalizeFolderUrl(url);
  const parsed = new URL(normalized);
  const urlParts = parsed.pathname.split("/").filter((part) => part.length > 0);
  if (parsed.pathname === "/") {
    return null;
  } else {
    return normalizeFolderUrl(
      `${parsed.origin}/${urlParts.slice(0, -1).join("/")}`
    );
  }
}

export function isTopFolder(url: string) {
  return new URL(url).pathname === "/";
}

// Normalizes a url path by removing trailing slashes and empty path parts (eg: //)
export function normalizeFolderUrl(url: string) {
  const parsed = new URL(url);
  let result =
    parsed.origin +
    "/" +
    parsed.pathname
      .split("/")
      .filter((x) => x)
      .join("/");

  if (parsed.search.length > 0) {
    // Replace the leading ? with a /
    result += "/" + parsed.search.slice(1);
  }

  return result;
}

export function getDisplayNameForPage(page: WebCrawlerPage): string {
  const parsed = new URL(page.url);
  let result = "";
  const fragments = parsed.pathname.split("/").filter((x) => x);
  const lastFragment = fragments.pop();
  if (lastFragment) {
    result += lastFragment;
  }
  if (parsed.search.length > 0) {
    result += parsed.search;
  }

  if (!result) {
    result = parsed.origin;
  }

  return result;
}

export function getDisplayNameForFolder(folder: WebCrawlerFolder): string {
  return (
    new URL(folder.url).pathname
      .split("/")
      .filter((x) => x)
      .pop() || folder.url
  );
}

export async function getIpAddressForUrl(url: string) {
  const host = new URL(url).hostname;
  return dns.promises.lookup(host);
}

export function isPrivateIp(ip: string) {
  // Simple patterns for common private ranges.
  const simpleRanges = /^(0|127|10|192\.168|169\.254)\./;

  // 172.16.0.0/12 range (172.16-31.x.x).
  // Only 172.16 through 172.31 are private.
  const range172 = /^172\.(1[6-9]|2[0-9]|3[0-1])\./;

  // 100.64.0.0/10 range (100.64-127.x.x).
  // Only 100.64 through 100.127 are Carrier-grade NAT.
  const range100 = /^100\.(6[4-9]|7[0-9]|8[0-9]|9[0-9]|1[01][0-9]|12[0-7])\./;

  return simpleRanges.test(ip) || range172.test(ip) || range100.test(ip);
}
