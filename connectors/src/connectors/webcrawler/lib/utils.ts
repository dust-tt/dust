import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { hash as blake3 } from "blake3";
import { NonRetryableError } from "crawlee";
import dns from "dns";

import type {
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import type { ContentNodeType } from "@connectors/types";
import { WEBCRAWLER_MAX_DEPTH } from "@connectors/types";

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type WebCrawlerErrorName =
  | "PRIVATE_IP"
  | "NOT_IP_V4"
  | "MAX_REDIRECTS"
  | "REDIRECT_MISSING_LOCATION"
  | "CIRCULAR_REDIRECT"
  | "PROTOCOL_DOWNGRADE";

export class WebCrawlerError extends NonRetryableError {
  constructor(
    message: string,
    readonly type: WebCrawlerErrorName,
    readonly originalError?: Error
  ) {
    super(message);
  }
}

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

export function shouldCrawlLink(
  link: string,
  webCrawlerConfig: { url: string; depth: number; crawlMode: string },
  currentRequestDepth: number
): boolean {
  const linkURL = new URL(link);
  const configURL = new URL(webCrawlerConfig.url);

  const isSameDomain = linkURL.hostname === configURL.hostname;
  const isChild =
    isSameDomain && linkURL.pathname.startsWith(configURL.pathname);

  const isWithinDepthLimit =
    currentRequestDepth + 1 < WEBCRAWLER_MAX_DEPTH &&
    currentRequestDepth + 1 < webCrawlerConfig.depth;

  const respectsCrawlMode = webCrawlerConfig.crawlMode !== "child" || isChild;

  // Link must satisfy all conditions to be crawled
  return (isSameDomain || isChild) && isWithinDepthLimit && respectsCrawlMode;
}

/**
 * Check if IP behind url is ipv4 and is not a private ip
 */
async function checkIp(url: URL): Promise<Result<void, WebCrawlerError>> {
  const { address, family } = await getIpAddressForUrl(url.toString());
  if (family !== 4) {
    return new Err(
      new WebCrawlerError(`IP address is not IPv4: ${address}`, "NOT_IP_V4")
    );
  }

  if (url.hostname === "localhost") {
    return new Err(
      new WebCrawlerError("No localhost authorized", "PRIVATE_IP")
    );
  }

  if (isPrivateIp(address)) {
    return new Err(
      new WebCrawlerError("Private IP adress detected", "PRIVATE_IP")
    );
  }

  return new Ok(undefined);
}

/**
 * Loop if needed on redirect location,
 * throw a Result Err that would warrant
 * a NonRetryableError. Otherwise return the last
 * url that is not a redirect
 */
export async function verifyRedirect(
  initUrl: string | URL
): Promise<Result<string | URL, WebCrawlerError>> {
  let url = initUrl;
  let foundEndOfRedirect = false;
  let redirectCount = 0;
  const visitedUrls = new Set<string>();

  do {
    // Fail fast if it get into a loop
    if (visitedUrls.has(url.toString())) {
      return new Err(
        new WebCrawlerError(
          "Invalid redirect: Circular redirect detected",
          "CIRCULAR_REDIRECT"
        )
      );
    }
    visitedUrls.add(url.toString());

    // Prevent infinite loops
    if (redirectCount++ >= MAX_REDIRECTS) {
      return new Err(
        new WebCrawlerError("Maximum redirect count exceeded", "MAX_REDIRECTS")
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (REDIRECT_STATUSES.has(response.status)) {
        const redirectUrl = response.headers
          .get("location")
          ?.trim()
          .replace(/[\r\n\t]/g, ""); // Sanitize location, avoid header injection
        if (!redirectUrl) {
          // Server returned a redirect status without Location header
          return new Err(
            new WebCrawlerError(
              `Invalid redirect: Missing Location header for status ${response.status}`,
              "REDIRECT_MISSING_LOCATION"
            )
          );
        }

        let resolvedUrl: URL;
        // relative redirect
        if (redirectUrl.startsWith("/")) {
          resolvedUrl = new URL(redirectUrl, url);
        } else {
          resolvedUrl = new URL(redirectUrl);
        }

        if (
          new URL(initUrl).protocol === "https:" &&
          resolvedUrl.protocol !== "https:"
        ) {
          return new Err(
            new WebCrawlerError(
              "Invalid redirect: going from https to http",
              "PROTOCOL_DOWNGRADE"
            )
          );
        }

        const checkIpRes = await checkIp(resolvedUrl);
        if (checkIpRes.isErr()) {
          return checkIpRes;
        }

        url = resolvedUrl;
      } else {
        foundEndOfRedirect = true;
      }
    } catch (err) {
      // try catch only to make sure we clear the timeout in case fetch failed
      clearTimeout(timeoutId);
      throw err;
    }
  } while (!foundEndOfRedirect);

  return new Ok(url);
}
