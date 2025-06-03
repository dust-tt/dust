import type { ConnectorProvider } from "@dust-tt/client";

type BaseProvider = {
  matcher: (url: URL) => boolean;
};

export type UrlCandidate = { url: string | null; provider: ConnectorProvider };
export type NodeCandidate = {
  node: string | null;
  provider: ConnectorProvider;
};

export function isUrlCandidate(
  candidate: UrlCandidate | NodeCandidate | null
): candidate is UrlCandidate {
  return candidate !== null && "url" in candidate;
}

export function isNodeCandidate(
  candidate: UrlCandidate | NodeCandidate | null
): candidate is NodeCandidate {
  return candidate !== null && "node" in candidate;
}

type ProviderWithNormalizer = BaseProvider & {
  urlNormalizer: (url: URL) => UrlCandidate;
  extractor?: never;
};

type ProviderWithExtractor = BaseProvider & {
  extractor: (url: URL) => NodeCandidate;
  urlNormalizer?: never;
};

type ProviderWithBoth = BaseProvider & {
  urlNormalizer: (url: URL) => UrlCandidate;
  extractor: (url: URL) => NodeCandidate;
};

type Provider =
  | ProviderWithExtractor
  | ProviderWithNormalizer
  | ProviderWithBoth;

const providers: Partial<Record<ConnectorProvider, Provider>> = {
  confluence: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.endsWith("atlassian.net") &&
        url.pathname.startsWith("/wiki")
      );
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      return { url: url.toString(), provider: "confluence" };
    },
    extractor: (url: URL): NodeCandidate => {
      // Extract page node ID from long-format Confluence URLs
      // Example: https://example.atlassian.net/wiki/spaces/SPACE/pages/12345678/Page+Title
      const pageMatch = url.pathname.match(
        /\/wiki\/spaces\/[^/]+\/pages\/(\d+)/
      );
      if (pageMatch && pageMatch[1]) {
        return {
          node: `confluence-page-${pageMatch[1]}`,
          provider: "confluence",
        };
      }
      return { node: null, provider: "confluence" };
    },
  },
  google_drive: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.includes("drive.google.com") ||
        url.hostname.includes("docs.google.com")
      );
    },
    extractor: (url: URL): NodeCandidate => {
      // Extract from /d/ID format (common in all Google Drive URLs)
      const driveMatch = url.pathname.match(/\/d\/([^/]+)/);
      if (driveMatch && driveMatch[1]) {
        return { node: `gdrive-${driveMatch[1]}`, provider: "google_drive" };
      }

      // Extract from URL parameters (some older Drive formats)
      const idParam = url.searchParams.get("id");
      if (idParam) {
        return { node: `gdrive-${idParam}`, provider: "google_drive" };
      }

      return { node: null, provider: "google_drive" };
    },
  },
  github: {
    matcher: (url: URL): boolean => {
      return url.hostname.endsWith("github.com");
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      return { url: url.toString(), provider: "github" };
    },
  },
  notion: {
    matcher: (url: URL): boolean => {
      return url.hostname.includes("notion.so");
    },
    extractor: (url: URL): NodeCandidate => {
      // Get the last part of the path, which contains the ID
      const pathParts = url.pathname.split("/");
      const lastPart = pathParts[pathParts.length - 1];

      // Notion IDs are 32 characters at the end of the URL path (after last dash).
      if (lastPart) {
        const parts = lastPart.split("-");
        const candidate = parts[parts.length - 1];

        if (candidate && candidate.length === 32) {
          // If we have a 32-character ID (without hyphen) we are good to reconstrcut the ID.
          const id =
            "notion-" +
            candidate.slice(0, 8) +
            "-" +
            candidate.slice(8, 12) +
            "-" +
            candidate.slice(12, 16) +
            "-" +
            candidate.slice(16, 20) +
            "-" +
            candidate.slice(20);
          return { node: id, provider: "notion" };
        }
      }

      return { node: null, provider: "notion" };
    },
  },
  slack: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.includes("slack.com") &&
        // archives is present is thread and messages urls while client
        // is in channel ones
        (url.pathname.includes("/archives/") ||
          url.pathname.includes("/client/"))
      );
    },
    extractor: (url: URL): NodeCandidate => {
      // Try each type of extraction in order
      const node = extractThreadNodeId(url) || extractChannelNodeId(url);
      return node
        ? { node, provider: "slack" }
        : { node: null, provider: "slack" };
    },
  },
  gong: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.endsWith("app.gong.io") &&
        url.pathname === "/call" &&
        url.searchParams.has("id")
      );
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      return { url: url.toString(), provider: "gong" };
    },
  },
  zendesk: {
    matcher: (url: URL): boolean => {
      return url.hostname.endsWith("zendesk.com");
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      const path = url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;
      return { url: `${url.origin}${path}`, provider: "zendesk" };
    },
  },
  intercom: {
    matcher: (url: URL): boolean => {
      return (
        (url.hostname.includes("intercom.com") &&
          url.hostname.startsWith("app")) ||
        // custom help center domains (websiteTurnedOn is true)
        url.hostname.startsWith("help")
      );
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      const path = url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;
      return { url: `${url.origin}${path}`, provider: "intercom" };
    },
  },
};

// Extract a channel node ID from a Slack client URL
function extractChannelNodeId(url: URL): string | null {
  const pathParts = url.pathname.split("/");
  if (pathParts[1] === "client" && pathParts.length >= 4) {
    const channelId = pathParts[3];
    return `slack-channel-${channelId}`;
  }
  return null;
}

// Extract a thread node ID from a Slack archives URL
function extractThreadNodeId(url: URL): string | null {
  const pathParts = url.pathname.split("/");
  const channelIndex = pathParts.indexOf("archives");

  if (channelIndex === -1 || channelIndex + 1 >= pathParts.length) {
    return null;
  }

  const threadTs = url.searchParams.get("thread_ts");

  // If there is a thread_ts parameter, the link was copied from inside the
  // thread, not from the root message of the thread.
  // Example: https://dust4ai.slack.com/archives/C05V0P20A72/p1748353621866279?thread_ts=1748353030.562719&cid=C05V0P20A72
  if (threadTs) {
    const channelId = pathParts[channelIndex + 1];
    return `slack-${channelId}-thread-${threadTs}`;
  }

  // Otherwise, the link may have been copied from the root message of the
  // thread, in which case we can use the channel ID and the 'p' timestamp in
  // the URL, which is the timestamp representing the thread..
  // Example: https://dust4ai.slack.com/archives/C05V0P20A72/p1748353030562719
  if (pathParts.length <= channelIndex + 2) {
    return null;
  }

  const channelId = pathParts[channelIndex + 1];
  const messagePart = pathParts[channelIndex + 2];

  if (!messagePart || !messagePart.startsWith("p")) {
    return null;
  }

  // Extract timestamp and convert to thread timestamp (with dot at decimal 6 before last digit)
  const timestamp = messagePart.substring(1);
  // add a dot at decimal 6 before last digit
  const inferredThreadTs = timestamp.slice(0, -6) + "." + timestamp.slice(-6);

  return `slack-${channelId}-thread-${inferredThreadTs}`;
}

export function nodeCandidateFromUrl(
  url: string
): UrlCandidate | NodeCandidate | null {
  try {
    const urlObj = new URL(url);

    for (const provider of Object.values(providers)) {
      if (provider.matcher(urlObj)) {
        if (provider.extractor && provider.urlNormalizer) {
          const result = provider.extractor(urlObj);
          if (result.node) {
            return result;
          } else {
            return provider.urlNormalizer(urlObj);
          }
        } else if (provider.extractor) {
          return provider.extractor(urlObj);
        } else {
          return provider.urlNormalizer(urlObj);
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error parsing URL:", error);
    return null;
  }
}
