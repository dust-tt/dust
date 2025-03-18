import type { DataSourceType } from "@dust-tt/client";

export function isFolder(
  ds: DataSourceType
): ds is DataSourceType & { connectorProvider: null } {
  // If there is no connectorProvider, it's a folder.
  return !ds.connectorProvider;
}

export function isWebsite(
  ds: DataSourceType
): ds is DataSourceType & { connectorProvider: "webcrawler" } {
  return ds.connectorProvider === "webcrawler";
}
