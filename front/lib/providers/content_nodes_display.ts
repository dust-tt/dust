import type { DataSourceViewContentNode } from "@app/types";

import { getMicrosoftSharePointRootFolderDisplayTitle } from "./microsoft/content_nodes_display";

export function getDisplayTitleForDataSourceViewContentNode(
  node: DataSourceViewContentNode
): string {
  const provider = node.dataSourceView.dataSource.connectorProvider;

  switch (provider) {
    case "microsoft":
      return getMicrosoftSharePointRootFolderDisplayTitle(node);
    default:
      return node.title;
  }
}
