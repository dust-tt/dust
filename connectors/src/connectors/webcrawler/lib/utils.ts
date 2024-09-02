import type { ContentNodeType } from "@dust-tt/types";
import { hash as blake3 } from "blake3";
import dns from "dns";

import type { WebCrawlerPage } from "@connectors/lib/models/webcrawler";

// Generate a stable id for a given url and ressource type
// That way we don't have to send URL as documentId to the front API.
export function stableIdForUrl({
  url,
  ressourceType,
}: {
  url: string;
  ressourceType: ContentNodeType;
}) {
  return Buffer.from(blake3(`${ressourceType}-${url}`)).toString("hex");
}

export function getParentsForPage(url: string, pageInItsOwnFolder: boolean) {
  const parents: string[] = [];
  parents.push(stableIdForUrl({ url, ressourceType: "file" }));
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

export async function getIpAddressForUrl(url: string) {
  const host = new URL(url).hostname;
  return dns.promises.lookup(host);
}

export function isPrivateIp(ip: string) {
  const privatePrefixes = ["0.", "127.", "10.", "192.168."];
  for (const prefix of privatePrefixes) {
    if (ip.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}
