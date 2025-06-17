import {
  Citation,
  CitationIcons,
  CitationTitle,
  DocumentIcon,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isDataSourceNodeContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

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

  return (
    <ActionDetailsWrapper
      actionName="Retrieve file content"
      defaultOpen={defaultOpen}
      visual={DocumentIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div>
          <Citation
            onClick={(() => {
              const { sourceUrl } = metadata;
              return sourceUrl
                ? () => window.open(sourceUrl, "_blank")
                : undefined;
            })()}
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
