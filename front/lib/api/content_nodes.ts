import type { CoreAPITable } from "@dust-tt/types";
import {
  assertNever,
  getGoogleSheetContentNodeInternalIdFromTableId,
  getMicrosoftSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
} from "@dust-tt/types";

import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export function getContentNodeInternalIdFromTableId(
  dataSourceView: DataSourceViewResource,
  table: CoreAPITable
): string {
  const { dataSource } = dataSourceView;
  const { table_id: tableId } = table;

  switch (dataSource.connectorProvider) {
    case "google_drive":
      return getGoogleSheetContentNodeInternalIdFromTableId(tableId);

    case "notion":
      return getNotionDatabaseContentNodeInternalIdFromTableId(tableId);

    case "microsoft":
      return getMicrosoftSheetContentNodeInternalIdFromTableId(tableId);

    // For static and snowflake tables, the contentNode internalId is the tableId.
    case null:
    case "snowflake":
      return tableId;

    case "intercom":
    case "confluence":
    case "github":
    case "slack":
    case "webcrawler":
      throw new Error(
        `Provider ${dataSource.connectorProvider} is not supported`
      );

    default:
      assertNever(dataSource.connectorProvider);
  }
}
