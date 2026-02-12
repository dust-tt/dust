import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  ActionPinDistanceIcon,
  Breadcrumbs,
  Citation,
  CitationIcons,
  CitationTitle,
  DocumentIcon,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isDataSourceNodeContentType,
  isFilesystemPathType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isDataSourceFilesystemHeadTailInputType } from "@app/lib/actions/mcp_internal_actions/types";
import {
  getDocumentIcon,
  getVisualForContentNodeType,
} from "@app/lib/content_nodes";
import { formatDataSourceDisplayName } from "@app/types/core/core_api";

function makeReadDescription(
  readMode: "head" | "tail" | undefined,
  toolParams: Record<string, unknown>
): string | null {
  if (!readMode || !isDataSourceFilesystemHeadTailInputType(toolParams)) {
    return null;
  }
  return readMode === "head"
    ? `First ${toolParams.n} lines`
    : `Last ${toolParams.n} lines`;
}

interface DataSourceNodeContentDetailsProps extends ToolExecutionDetailsProps {
  readMode?: "head" | "tail";
}

export function DataSourceNodeContentDetails({
  toolOutput,
  toolParams,
  displayContext,
  readMode,
}: DataSourceNodeContentDetailsProps) {
  const dataSourceNodeContent = toolOutput
    ?.filter(isDataSourceNodeContentType)
    .map((o) => o.resource)?.[0];

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const { metadata, text } = dataSourceNodeContent || {};
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const { sourceUrl } = metadata || {};

  const readDescription = makeReadDescription(readMode, toolParams);

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
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

        {readDescription && (
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {readDescription}
          </span>
        )}

        {displayContext === "sidebar" && sourceUrl && text && (
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
  toolOutput,
  displayContext,
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
      displayContext={displayContext}
      actionName={
        displayContext === "conversation" ? "Locating item" : "Locate item"
      }
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
