import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";

function getConnectorOrder() {
  return Object.keys(CONNECTOR_CONFIGURATIONS)
    .filter(
      (key) =>
        CONNECTOR_CONFIGURATIONS[key as keyof typeof CONNECTOR_CONFIGURATIONS]
          .connectorProvider !==
        CONNECTOR_CONFIGURATIONS.webcrawler.connectorProvider
    )
    .map(
      (key) =>
        CONNECTOR_CONFIGURATIONS[key as keyof typeof CONNECTOR_CONFIGURATIONS]
          .connectorProvider
    );
}

type ComparableByProvider = { connectorProvider: ConnectorProvider | null };

function compareByImportance(
  a: ComparableByProvider,
  b: ComparableByProvider
): number {
  const aConnector = a.connectorProvider;
  const bConnector = b.connectorProvider;

  const order = getConnectorOrder();

  // Handle null cases.
  if (aConnector === null) {
    return bConnector === null ? 0 : 1;
  }
  if (bConnector === null) {
    return -1;
  }

  // Handle webcrawler cases.
  if (aConnector === "webcrawler") {
    return 1;
  }
  if (bConnector === "webcrawler") {
    return -1;
  }

  // Get indices in sorted connectors.
  const indexA = order.indexOf(aConnector);
  const indexB = order.indexOf(bConnector);

  // If both are not found, they are considered equal.
  if (indexA === -1 && indexB === -1) {
    return 0;
  }

  // Compare indices, treating not found as less important.
  return (
    (indexA === -1 ? order.length : indexA) -
    (indexB === -1 ? order.length : indexB)
  );
}

// Order in the following format : connectorProvider > empty > webcrawler
export function orderDatasourceByImportance<Type extends ComparableByProvider>(
  dataSources: Type[]
) {
  return dataSources.sort(compareByImportance);
}

export function orderDatasourceViewByImportance<
  Type extends { dataSource: ComparableByProvider },
>(dataSourceViews: Type[]) {
  return dataSourceViews.sort((a, b) => {
    return compareByImportance(a.dataSource, b.dataSource);
  });
}

export function orderDatasourceViewSelectionConfigurationByImportance<
  Type extends { dataSourceView: { dataSource: ComparableByProvider } },
>(dataSourceViews: Type[]) {
  return dataSourceViews.sort((a, b) => {
    return compareByImportance(
      a.dataSourceView.dataSource,
      b.dataSourceView.dataSource
    );
  });
}

interface Provider {
  matcher: (url: URL) => boolean;
  extractor: (url: URL) => string | null;
}

const providers: Record<string, Provider> = {
  googleDrive: {
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
        url.pathname.includes("/archives/")
      );
    },
    extractor: (url: URL): string | null => {
      // Extract channel ID from the pathname
      const pathParts = url.pathname.split("/");
      const channelIndex = pathParts.indexOf("archives");
      if (channelIndex === -1 || channelIndex + 1 >= pathParts.length) {
        return null;
      }

      const channelId = pathParts[channelIndex + 1];

      // Check if this is a thread URL by looking for thread_ts parameter
      const threadTs = url.searchParams.get("thread_ts");
      if (threadTs) {
        return `slack-${channelId}-thread-${threadTs}`;
      }

      // If not a thread, it's a regular message - extract message timestamp from path
      if (pathParts.length > channelIndex + 2) {
        const messagePart = pathParts[channelIndex + 2];
        if (messagePart && messagePart.startsWith("p")) {
          // Extract timestamp (remove the 'p' prefix)
          const timestamp = messagePart.substring(1);
          const messageDate = new Date(parseInt(timestamp) / 1000);

          // Get week start and end dates
          const getWeekStart = (date: Date): Date => {
            const dateCopy = new Date(date);
            dateCopy.setHours(0);
            dateCopy.setMinutes(0);
            dateCopy.setSeconds(0);
            dateCopy.setMilliseconds(0);
            const diff =
              dateCopy.getDate() -
              dateCopy.getDay() +
              (dateCopy.getDay() === 0 ? -6 : 1);
            return new Date(dateCopy.setDate(diff));
          };

          const getWeekEnd = (date: Date): Date => {
            const dateCopy = new Date(date);
            dateCopy.setHours(0);
            dateCopy.setMinutes(0);
            dateCopy.setSeconds(0);
            dateCopy.setMilliseconds(0);
            const diff =
              dateCopy.getDate() -
              dateCopy.getDay() +
              (dateCopy.getDay() === 0 ? -6 : 1);
            return new Date(dateCopy.setDate(diff + 7));
          };

          const startDate = getWeekStart(messageDate);
          const endDate = getWeekEnd(messageDate);

          const startDateStr = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`;
          const endDateStr = `${endDate.getFullYear()}-${endDate.getMonth()}-${endDate.getDate()}`;

          return `slack-${channelId}-messages-${startDateStr}-${endDateStr}`;
        }
      }

      return null;
    },
  },
};

// Extracts a nodeId from a given url
// Currently supports Google Drive documents and Notion pages
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
