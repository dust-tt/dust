import type { DataSourceViewContentNode } from "@app/types";

import { getMicrosoftSharePointDisplayTitle } from "./microsoft/content_nodes_display";

export function getDisplayTitleForDataSourceViewContentNode(
  node: DataSourceViewContentNode,
  { prefixSiteName }: { prefixSiteName?: boolean } = {}
): string {
  const provider = node.dataSourceView.dataSource.connectorProvider;

  switch (provider) {
    case "microsoft":
      return getMicrosoftSharePointDisplayTitle(node, { prefixSiteName });
    default:
      return node.title;
  }
}
