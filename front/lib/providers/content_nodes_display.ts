import type { DataSourceViewContentNode } from "@app/types/data_source_view";

import { getMicrosoftSharePointDisplayTitle } from "./microsoft/content_nodes_display";

export function getDisplayTitleForDataSourceViewContentNode(
  node: DataSourceViewContentNode,
  { disambiguate }: { disambiguate?: boolean } = {}
): string {
  const provider = node.dataSourceView.dataSource.connectorProvider;

  switch (provider) {
    case "microsoft":
      return getMicrosoftSharePointDisplayTitle(node, { disambiguate });
    default:
      return node.title;
  }
}
