import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type {
  ConnectorProvider,
  CoreAPIDocument,
  DataSourceType,
  DataSourceViewType,
  WithConnector,
} from "@app/types";
import { assertNever } from "@app/types";

export function getDisplayNameForDocument(document: CoreAPIDocument): string {
  const titleTagPrefix = "title:";
  const titleTag = document.tags.find((tag) => tag.startsWith(titleTagPrefix));
  if (!titleTag) {
    return document.document_id;
  }
  return titleTag.substring(titleTagPrefix.length);
}

export function getDisplayNameForDataSource(ds: DataSourceType) {
  if (ds.connectorProvider) {
    switch (ds.connectorProvider) {
      case "confluence":
      case "slack":
      case "google_drive":
      case "github":
      case "intercom":
      case "microsoft":
      case "notion":
      case "zendesk":
      case "snowflake":
      case "bigquery":
      case "salesforce":
      case "gong":
        return CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name;
      case "webcrawler":
        return ds.name;
      default:
        assertNever(ds.connectorProvider);
    }
  } else {
    return ds.name;
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
    connectorProvider: "snowflake" | "bigquery" | "salesforce";
  } {
  return (
    ds.connectorProvider === "snowflake" ||
    ds.connectorProvider === "bigquery" ||
    ds.connectorProvider === "salesforce"
  );
}

const STRUCTURED_DATA_SOURCES: ConnectorProvider[] = [
  "google_drive",
  "notion",
  "microsoft",
  "salesforce",
];

export function supportsDocumentsData(ds: DataSource): boolean {
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
