import type { ConnectorProvider } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

export function isConnectorTypeTrackable(
  connectorType: ConnectorProvider
): boolean {
  switch (connectorType) {
    case "google_drive":
    case "github":
    case "notion":
    case "microsoft":
    case "confluence":
    case "intercom":
    case "webcrawler":
    case "snowflake":
    case "zendesk":
    case "bigquery":
    case "salesforce":
    case "gong":
      return true;
    case "slack":
      return false;
    default:
      assertNever(connectorType);
  }
}
