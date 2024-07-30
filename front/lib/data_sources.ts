import type { CoreAPIDocument, DataSourceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { DataSource } from "@app/lib/models/data_source";

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
        return CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name;
        break;
      case "webcrawler":
        return ds.name;
      default:
        assertNever(ds.connectorProvider);
    }
  } else {
    return ds.name;
  }
}

export function renderDataSourceType(dataSource: DataSource): DataSourceType {
  return {
    id: dataSource.id,
    createdAt: dataSource.createdAt.getTime(),
    name: dataSource.name,
    description: dataSource.description,
    assistantDefaultSelected: dataSource.assistantDefaultSelected,
    dustAPIProjectId: dataSource.dustAPIProjectId,
    connectorId: dataSource.connectorId,
    connectorProvider: dataSource.connectorProvider,
    editedByUser: undefined,
  };
}
