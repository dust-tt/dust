import type { ConnectorProvider } from "@app/types";
import { assertNever } from "@app/types";

export function isConnectorTypeTrackable(
  connectorType: ConnectorProvider
): boolean {
  // TODO(2025-03-24 aubin): see if this can be handled through an optional (default to true) property in CONNECTOR_CONFIGURATIONS.
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
