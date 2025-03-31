import { getWeekBoundaries } from "@app/shared/lib/utils";
import type { ConnectorProvider } from "@dust-tt/client";

type BaseProvider = {
  matcher: (url: URL) => boolean;
};

export type UrlCandidate = { url: string } | null;
export type NodeCandidate = { node: string } | null;

export function isUrlCandidate(
  candidate: UrlCandidate | NodeCandidate
): candidate is UrlCandidate {
  return candidate !== null && "url" in candidate;
}

export function isNodeCandidate(
  candidate: UrlCandidate | NodeCandidate
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

type Provider = ProviderWithExtractor | ProviderWithNormalizer;

const providers: Partial<Record<ConnectorProvider, Provider>> = {
  confluence: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.endsWith("atlassian.net") &&
        url.pathname.startsWith("/wiki")
      );
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      return { url: url.toString() };
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
        return { node: `gdrive-${driveMatch[1]}` };
      }

      // Extract from URL parameters (some older Drive formats)
      const idParam = url.searchParams.get("id");
      if (idParam) {
        return { node: `gdrive-${idParam}` };
      }

      return null;
    },
  },
  github: {
    matcher: (url: URL): boolean => {
      return url.hostname.endsWith("github.com");
    },
    urlNormalizer: (url: URL): UrlCandidate => {
      return { url: url.toString() };
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
          return { node: id };
        }
      }

      return null;
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
      const node =
        extractMessageNodeId(url) ||
        extractThreadNodeId(url) ||
        extractChannelNodeId(url);
      return node ? { node } : null;
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
      return { url: url.toString() };
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
      return { url: `${url.origin}${path}` };
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
      return { url: `${url.origin}${path}` };
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
  if (!threadTs) {
    return null;
  }

  const channelId = pathParts[channelIndex + 1];
  return `slack-${channelId}-thread-${threadTs}`;
}

// Extract a message node ID from a Slack archives URL
function extractMessageNodeId(url: URL): string | null {
  function formatDateForId(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  const pathParts = url.pathname.split("/");
  const channelIndex = pathParts.indexOf("archives");

  if (
    channelIndex === -1 ||
    channelIndex + 1 >= pathParts.length ||
    pathParts.length <= channelIndex + 2
  ) {
    return null;
  }

  const channelId = pathParts[channelIndex + 1];
  const messagePart = pathParts[channelIndex + 2];

  if (!messagePart || !messagePart.startsWith("p")) {
    return null;
  }

  // Extract timestamp and convert to date
  const timestamp = messagePart.substring(1);
  const messageDate = new Date(parseInt(timestamp) / 1000);

  // Calculate week boundaries
  const { startDate, endDate } = getWeekBoundaries(messageDate);

  // Format dates for node ID
  const startDateStr = formatDateForId(startDate);
  const endDateStr = formatDateForId(endDate);

  return `slack-${channelId}-messages-${startDateStr}-${endDateStr}`;
}

// Extracts a nodeId from a given url
export function nodeIdFromUrl(url: string): UrlCandidate | NodeCandidate {
  try {
    const urlObj = new URL(url);

    for (const provider of Object.values(providers)) {
      if (provider.matcher(urlObj)) {
        if (provider.extractor) {
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
