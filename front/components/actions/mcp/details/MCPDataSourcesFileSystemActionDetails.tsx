import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  ActionPinDistanceIcon,
  Breadcrumbs,
  Button,
  Citation,
  CitationIcons,
  CitationTitle,
  cn,
  DocumentIcon,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isDataSourceNodeContentType,
  isFilesystemPathType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getDocumentIcon,
  getVisualForContentNodeType,
} from "@app/lib/content_nodes";
import { formatDataSourceDisplayName } from "@app/types";

// max-h-96 = 384px
const MAX_COLLAPSED_HEIGHT_PX = 384;

export function DataSourceNodeContentDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpand, setNeedsExpand] = useState(false);

  const dataSourceNodeContent = toolOutput
    ?.filter(isDataSourceNodeContentType)
    .map((o) => o.resource)?.[0];

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const { metadata, text } = dataSourceNodeContent || {};
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const { sourceUrl } = metadata || {};

  const handleContentRef = (node: HTMLDivElement | null) => {
    if (node) {
      setNeedsExpand(node.scrollHeight > MAX_COLLAPSED_HEIGHT_PX);
    }
  };

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Retrieving file content"
          : "Retrieve file content"
      }
      visual={DocumentIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div>
          {metadata && (
            <Citation
              onClick={
                sourceUrl ? () => window.open(sourceUrl, "_blank") : undefined
              }
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              tooltip={`${metadata.parentTitle || metadata.path}${metadata.lastUpdatedAt ? ` • ${metadata.lastUpdatedAt}` : ""}`}
            >
              <CitationIcons>
                <Icon visual={getDocumentIcon(metadata.connectorProvider)} />
              </CitationIcons>
              <CitationTitle>{metadata.title}</CitationTitle>
            </Citation>
          )}
        </div>

        {viewType === "sidebar" && sourceUrl && text && (
          <div className="relative">
            <div
              ref={handleContentRef}
              className={cn("overflow-hidden", !isExpanded && "max-h-96")}
            >
              <Markdown
                content={text}
                isStreaming={false}
                textColor="text-muted-foreground dark:text-muted-foreground-night"
                forcedTextSize="text-sm"
              />
            </div>
            {needsExpand && !isExpanded && (
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-background-night" />
            )}
            {needsExpand && (
              <div className="mt-2 flex justify-center">
                <Button
                  variant="ghost"
                  size="xs"
                  label={isExpanded ? "Show less" : "Show more"}
                  onClick={() => setIsExpanded(!isExpanded)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}

export function FilesystemPathDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const filesystemPath = toolOutput
    ?.filter(isFilesystemPathType)
    .map((o) => o.resource)?.[0];

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const { path } = filesystemPath || { path: [] };

  const breadcrumbItems: BreadcrumbItem[] = path?.map((item) =>
    item.sourceUrl
      ? {
          icon: getVisualForContentNodeType(item.nodeType),
          label: item.title,
          isCurrent: item.isCurrentNode,
          href: item.sourceUrl,
        }
      : {
          icon: getVisualForContentNodeType(item.nodeType),
          label: item.title,
          isCurrent: item.isCurrentNode,
        }
  );

  if (breadcrumbItems.length > 0) {
    // Reformat the label for the first item, which is the data source.
    breadcrumbItems[0].label = formatDataSourceDisplayName(
      breadcrumbItems[0].label
    );
    // Add the provider icon for the data source (best effort, does not work on all providers).
    breadcrumbItems[0].icon = getDocumentIcon(
      breadcrumbItems[0].label.toLowerCase()
    );
  }

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Locating item" : "Locate item"}
      visual={ActionPinDistanceIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <span className="text-sm font-bold text-foreground dark:text-foreground-night">
          Location
        </span>
        <Breadcrumbs className="pl-2" items={breadcrumbItems} />
      </div>
    </ActionDetailsWrapper>
  );
}
