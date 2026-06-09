import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import type { DataSourceViewContentNode } from "@app/lib/swr/search";
import {
  AlertCircle,
  AttachmentChip,
  Chip,
  DoubleIcon,
  Icon,
} from "@dust-tt/sparkle";
import type React from "react";

type KnowledgeNode = Omit<
  DataSourceViewContentNode,
  "dataSourceViews" | "dataSource"
> & {
  dataSourceView: DataSourceViewContentNode["dataSourceViews"][number];
};

interface KnowledgeChipProps {
  color?: React.ComponentProps<typeof AttachmentChip>["color"];
  node: KnowledgeNode;
  onRemove?: () => void;
  title: string;
}

export function KnowledgeChip({
  color = "white",
  node,
  title,
  onRemove,
}: KnowledgeChipProps) {
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
    <AttachmentChip
      label={title}
      icon={{ visual: icon }}
      target="_blank"
      href={node.sourceUrl ?? undefined}
      color={color}
      onRemove={onRemove}
      size="xs"
    />
  );
}

interface InlineKnowledgeChipProps {
  color?: React.ComponentProps<typeof Chip>["color"];
  node: KnowledgeNode;
  onRemove?: () => void;
  title: string;
}

function InlineKnowledgeIcon({ node }: { node: KnowledgeNode }) {
  if (
    isWebsite(node.dataSourceView.dataSource) ||
    isFolder(node.dataSourceView.dataSource)
  ) {
    return (
      <Icon visual={getVisualForDataSourceViewContentNode(node)} size="xs" />
    );
  }

  return (
    <DoubleIcon
      size="sm"
      mainIcon={getVisualForDataSourceViewContentNode(node)}
      secondaryIcon={getConnectorProviderLogoWithFallback({
        provider: node.dataSourceView.dataSource.connectorProvider,
      })}
    />
  );
}

export function InlineKnowledgeChip({
  color = "white",
  node,
  title,
  onRemove,
}: InlineKnowledgeChipProps) {
  const children = <InlineKnowledgeIcon node={node} />;

  if (node.sourceUrl) {
    return (
      <Chip
        label={title}
        href={node.sourceUrl}
        target="_blank"
        color={color}
        onRemove={onRemove}
        size="xs"
      >
        {children}
      </Chip>
    );
  }

  return (
    <Chip label={title} color={color} onRemove={onRemove} size="xs">
      {children}
    </Chip>
  );
}

interface KnowledgeErrorChipProps {
  errorMessage?: string;
  onRemove?: () => void;
  title: string;
}

export function KnowledgeErrorChip({
  onRemove,
  title,
}: KnowledgeErrorChipProps) {
  return (
    <Chip
      label={title}
      icon={AlertCircle}
      color="white"
      onRemove={onRemove}
      size="xs"
    />
  );
}
