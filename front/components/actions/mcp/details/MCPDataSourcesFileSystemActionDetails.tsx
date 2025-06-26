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
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isDataSourceNodeContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isFilesystemPathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getVisualForContentNodeType } from "@app/lib/content_nodes";
import { formatDataSourceDisplayName } from "@app/types";

export function DataSourceNodeContentDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const dataSourceNodeContent = action.output
    ?.filter(isDataSourceNodeContentType)
    .map((o) => o.resource)?.[0];

  if (!dataSourceNodeContent) {
    return null;
  }

  const { metadata } = dataSourceNodeContent;
  const { sourceUrl } = metadata;

  return (
    <ActionDetailsWrapper
      actionName="Retrieve file content"
      defaultOpen={defaultOpen}
      visual={DocumentIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div>
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
        </div>

        <Markdown
          content={dataSourceNodeContent.text}
          isStreaming={false}
          textColor="text-muted-foreground dark:text-muted-foreground-night"
          forcedTextSize="text-sm"
        />
      </div>
    </ActionDetailsWrapper>
  );
}

export function FilesystemPathDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const filesystemPath = action.output
    ?.filter(isFilesystemPathType)
    .map((o) => o.resource)?.[0];

  if (!filesystemPath) {
    return null;
  }

  const { path } = filesystemPath;

  const breadcrumbItems: BreadcrumbItem[] = path.map((item) =>
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

  // Reformat the label for the first item, which is the data source.
  breadcrumbItems[0].label = formatDataSourceDisplayName(
    breadcrumbItems[0].label
  );
  // Add the provider icon for the data source (best effort, does not work on all providers).
  breadcrumbItems[0].icon = getDocumentIcon(
    breadcrumbItems[0].label.toLowerCase()
  );

  return (
    <ActionDetailsWrapper
      actionName="Locate item"
      defaultOpen={defaultOpen}
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
