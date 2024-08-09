import type { CoreAPIDocument, DataSourceOrViewType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

export function getDisplayNameForDocument(document: CoreAPIDocument): string {
  const titleTagPrefix = "title:";
  const titleTag = document.tags.find((tag) => tag.startsWith(titleTagPrefix));
  if (!titleTag) {
    return document.document_id;
  }
  return titleTag.substring(titleTagPrefix.length);
}

export function getDisplayNameForDataSource(ds: DataSourceOrViewType) {
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
