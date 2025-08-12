import type { BreadcrumbItem } from "@dust-tt/sparkle";
import { ActionPinDistanceIcon } from "@dust-tt/sparkle";
import {
  Citation,
  CitationIcons,
  CitationTitle,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import { Breadcrumbs, DocumentIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import { isDataSourceNodeContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isFilesystemPathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getDocumentIcon } from "@app/lib/content_nodes";
import { getVisualForContentNodeType } from "@app/lib/content_nodes";
import { formatDataSourceDisplayName } from "@app/types";

export function DataSourceNodeContentDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const dataSourceNodeContent = action.output
    ?.filter(isDataSourceNodeContentType)
    .map((o) => o.resource)?.[0];

  const { metadata, text } = dataSourceNodeContent || {};
  const { sourceUrl } = metadata || {};

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Retrieve file content"
      visual={DocumentIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div>
          {metadata && (
            <Citation
              onClick={
                sourceUrl ? () => window.open(sourceUrl, "_blank") : undefined
              }
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
          <Markdown
            content={text}
            isStreaming={false}
            textColor="text-muted-foreground dark:text-muted-foreground-night"
            forcedTextSize="text-sm"
          />
        )}
      </div>
    </ActionDetailsWrapper>
  );
}

export function FilesystemPathDetails({
  action,
  defaultOpen,
}: MCPActionDetailsProps) {
  const filesystemPath = action.output
    ?.filter(isFilesystemPathType)
    .map((o) => o.resource)?.[0];

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
      actionName="Locate item"
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
