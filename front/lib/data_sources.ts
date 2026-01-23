import {
  CONNECTOR_CONFIGURATIONS,
  isBotIntegration,
} from "@app/lib/connector_providers";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type {
  ConnectorProvider,
  CoreAPIDocument,
  DataSourceType,
  DataSourceViewType,
  WhitelistableFeature,
  WithConnector,
} from "@app/types";

// TODO(DURABLE AGENTS 2025-06-25): Remove RetrievalDocumentResource support.
export function getDisplayNameForDocument(document: CoreAPIDocument): string {
  const titleTagPrefix = "title:";
  const titleTag = document.tags.find((tag) => tag.startsWith(titleTagPrefix));
  if (!titleTag) {
    return document.document_id;
  }

  return titleTag.substring(titleTagPrefix.length);
}

function getSetupSuffixForDataSource(
  dataSource: DataSourceType
): string | null {
  const match = dataSource.name.match(
    new RegExp(`managed\\-${dataSource.connectorProvider}\\-(.*)`)
  );
  if (!match || match.length < 2) {
    return null;
  }
  return match[1];
}

export function getDisplayNameForDataSource(
  ds: DataSourceType,
  aggregateFolder: boolean = false
) {
  if (ds.connectorProvider) {
    if (ds.connectorProvider === "webcrawler") {
      return aggregateFolder ? "Websites" : ds.name;
    }
    // Not very satisfying to retro-engineer getDefaultDataSourceName but we don't store the suffix by itself.
    // This is a technical debt to have this function.
    const suffix = getSetupSuffixForDataSource(ds);
    if (suffix) {
      return `${CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name} (${suffix})`;
    }
    return CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name;
  } else {
    return aggregateFolder ? "Folders" : ds.name;
  }
}

type DataSource = DataSourceType | DataSourceResource;

export function isFolder(
  ds: DataSource
): ds is DataSource & { connectorProvider: null } {
  // If there is no connectorProvider, it's a folder.
  return !ds.connectorProvider;
}

export function isWebsite(
  ds: DataSource
): ds is DataSource & WithConnector & { connectorProvider: "webcrawler" } {
  return ds.connectorProvider === "webcrawler";
}

export function isManagedConnectorProvider(
  connectorProvider: ConnectorProvider
) {
  return connectorProvider !== "webcrawler";
}

export function isManaged(ds: DataSource): ds is DataSource & WithConnector {
  return (
    ds.connectorProvider !== null &&
    isManagedConnectorProvider(ds.connectorProvider)
  );
}

export function isRemoteDatabase(ds: DataSource): ds is DataSource &
  WithConnector & {
    connectorProvider: "snowflake" | "bigquery";
  } {
  return (
    ds.connectorProvider === "snowflake" || ds.connectorProvider === "bigquery"
  );
}

// Whether this data source should be included in the default "company data" tool for global agents.
export function isIncludedInDefaultCompanyData(ds: DataSource): boolean {
  if (isWebsite(ds)) {
    return false;
  }
  if (ds.connectorProvider && isBotIntegration(ds.connectorProvider)) {
    return false;
  }
  if (isRemoteDatabase(ds)) {
    return false;
  }
  return true;
}

const STRUCTURED_DATA_SOURCES: ConnectorProvider[] = [
  "google_drive",
  "notion",
  "microsoft",
  "salesforce",
];

export function supportsDocumentsData(
  ds: DataSource,
  featureFlags: WhitelistableFeature[]
): boolean {
  if (ds.connectorProvider === "salesforce") {
    return featureFlags.includes("salesforce_synced_queries");
  }
  return !isRemoteDatabase(ds);
}

export function supportsStructuredData(ds: DataSource): boolean {
  return Boolean(
    isFolder(ds) ||
    isRemoteDatabase(ds) ||
    (ds.connectorProvider &&
      STRUCTURED_DATA_SOURCES.includes(ds.connectorProvider))
  );
}

export function canBeExpanded(ds?: DataSource): boolean {
  if (!ds) {
    return false;
  }
  return true;
}

export function getDataSourceNameFromView(dsv: DataSourceViewType): string {
  return getDisplayNameForDataSource(dsv.dataSource);
}
