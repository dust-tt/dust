import type { ConnectorProvider } from "@dust-tt/types";
import {
  assertNever,
  getGoogleSheetContentNodeInternalIdFromTableId,
  getMicrosoftSheetContentNodeInternalIdFromTableId,
  getNotionDatabaseContentNodeInternalIdFromTableId,
} from "@dust-tt/types";

export function getContentNodeInternalIdFromTableId(
  connectorProvider: ConnectorProvider | null,
  tableId: string
): string {
  switch (connectorProvider) {
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
      throw new Error(`Provider ${connectorProvider} is not supported`);

    default:
      assertNever(connectorProvider);
  }
}
