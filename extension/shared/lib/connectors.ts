import { getWeekBoundaries } from "@app/shared/lib/utils";
import type { ConnectorProvider } from "@dust-tt/client";

interface Provider {
  matcher: (url: URL) => boolean;
  extractor: (url: URL) => string | null;
}

const providers: Partial<Record<ConnectorProvider, Provider>> = {
  google_drive: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.includes("drive.google.com") ||
        url.hostname.includes("docs.google.com")
      );
    },
    extractor: (url: URL): string | null => {
      // Extract from /d/ID format (common in all Google Drive URLs)
      const driveMatch = url.pathname.match(/\/d\/([^/]+)/);
      if (driveMatch && driveMatch[1]) {
        return `gdrive-${driveMatch[1]}`;
      }

      // Extract from URL parameters (some older Drive formats)
      const idParam = url.searchParams.get("id");
      if (idParam) {
        return `gdrive-${idParam}`;
      }

      return null;
    },
  },

  notion: {
    matcher: (url: URL): boolean => {
      return url.hostname.includes("notion.so");
    },
    extractor: (url: URL): string | null => {
      // Get the last part of the path, which contains the ID
      const pathParts = url.pathname.split("/");
      const lastPart = pathParts[pathParts.length - 1];

      // Notion IDs are 32 characters, often at the end of the URL path
      if (lastPart) {
        // Extract the ID part (after the last dash in the page title if present)
        const parts = lastPart.split("-");
        const idCandidate = parts[parts.length - 1];

        // If we have a 32-character ID (with or without hyphens)
        if (idCandidate && idCandidate.replace(/-/g, "").length === 32) {
          return idCandidate;
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
    extractor: (url: URL): string | null => {
      // Try each type of extraction in order
      return (
        extractChannelNodeId(url) ||
        extractThreadNodeId(url) ||
        extractMessageNodeId(url) ||
        null
      );
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
export function nodeIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    for (const provider of Object.values(providers)) {
      if (provider.matcher(urlObj)) {
        return provider.extractor(urlObj);
      }
    }

    return null;
  } catch (error) {
    console.error("Error parsing URL:", error);
    return null;
  }
}
