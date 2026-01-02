import { Chip, DoubleIcon } from "@dust-tt/sparkle";
import React from "react";

import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import type { DataSourceViewContentNode } from "@app/lib/swr/search";

type KnowledgeNode = Omit<DataSourceViewContentNode, "dataSourceViews"> & {
  dataSourceView: DataSourceViewContentNode["dataSourceViews"][0];
};

interface KnowledgeChipProps {
  node: KnowledgeNode;
  onRemove?: () => void;
  title: string;
}

export function KnowledgeChip({ node, title, onRemove }: KnowledgeChipProps) {
  const icon =
    isWebsite(node.dataSourceView.dataSource) ||
    isFolder(node.dataSourceView.dataSource)
      ? getVisualForDataSourceViewContentNode(node)
      : () => (
          <DoubleIcon
            size="sm"
            mainIcon={getVisualForDataSourceViewContentNode(node)}
            secondaryIcon={getConnectorProviderLogoWithFallback({
              provider: node.dataSourceView.dataSource.connectorProvider,
            })}
          />
        );

  return (
    <Chip
      size="mini"
      // TODO(2026-01-02 SKILL): decide on proper color.
      color="highlight"
      label={title}
      icon={icon}
      onRemove={onRemove}
      className="align-middle"
    />
  );
}
