import type { DataSourceType, LightContentNode } from "@app/types";
import { assertNever } from "@app/types";

export function getTableIdForContentNode(
  dataSource: DataSourceType,
  contentNode: LightContentNode
): string {
  if (contentNode.type !== "table") {
    throw new Error(`ContentNode type ${contentNode.type} is not supported`);
  }

  // We specify whether the connector supports TableQuery as a safeguard in case somehow a non-table node was selected.
  switch (dataSource.connectorProvider) {
    // For static tables, the tableId is the contentNode internalId.
    case null:
    case "bigquery":
    case "microsoft":
    case "notion":
    case "salesforce":
    case "snowflake":
    case "google_drive":
      return contentNode.internalId;

    case "confluence":
    case "github":
    case "gong":
    case "intercom":
    case "slack":
    case "slack_bot":
    case "webcrawler":
    case "zendesk":
      throw new Error(
        `Provider ${dataSource.connectorProvider} is not supported`
      );

    default:
      assertNever(dataSource.connectorProvider);
  }
}
