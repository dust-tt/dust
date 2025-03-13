import type { ConnectorProvider } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

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

// Extracts a nodeId from a given url
// Currently supports Google Drive documents and Notion pages
export function nodeIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Google Drive URL handling
    if (
      urlObj.hostname.includes("drive.google.com") ||
      urlObj.hostname.includes("docs.google.com")
    ) {
      // Extract from /d/ID format (common in all Google Drive URLs)
      const driveMatch = urlObj.pathname.match(/\/d\/([^/]+)/);
      if (driveMatch && driveMatch[1]) {
        return `gdrive-${driveMatch[1]}`;
      }

      // Extract from URL parameters (some older Drive formats)
      const idParam = urlObj.searchParams.get("id");
      if (idParam) {
        return `gdrive-${idParam}`;
      }
    }

    // Notion URL handling
    if (urlObj.hostname.includes("notion.so")) {
      // Get the last part of the path, which contains the ID
      const pathParts = urlObj.pathname.split("/");
      const lastPart = pathParts[pathParts.length - 1];

      // Notion IDs are 32 characters, often at the end of the URL path
      // Sometimes they include hyphens in the URL which we need to handle
      if (lastPart) {
        // Extract the ID part (after the last dash in the page title if present)
        const parts = lastPart.split("-");
        const idCandidate = parts[parts.length - 1];

        // If we have a 32-character ID (with or without hyphens)
        if (idCandidate && idCandidate.replace(/-/g, "").length === 32) {
          return idCandidate;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error parsing URL:", error);
    return null;
  }
}
