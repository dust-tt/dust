import { DocumentIcon, Icon, Markdown } from "@dust-tt/sparkle";

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
      actionName="File content"
      defaultOpen={defaultOpen}
      visual={DocumentIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="text-md mt-2 flex items-center gap-2 border-t pt-3 text-muted-foreground dark:text-muted-foreground-night">
          <Icon
            visual={getDocumentIcon(metadata.connectorProvider)}
            size="sm"
          />
          <span
            className={
              metadata.sourceUrl ? "cursor-pointer hover:underline" : ""
            }
            onClick={
              metadata.sourceUrl
                ? () => window.open(metadata.sourceUrl, "_blank")
                : undefined
            }
          >
            {metadata.title}
          </span>
          <span>•</span>
          <span>{metadata.parentTitle}</span>
          {metadata.lastUpdatedAt && (
            <>
              <span>•</span>
              <span>{metadata.lastUpdatedAt}</span>
            </>
          )}
        </div>
        <div className="pt-2">
          <Markdown
            content={dataSourceNodeContent.text}
            isStreaming={false}
            textColor="text-muted-foreground dark:text-muted-foreground-night"
            forcedTextSize="text-sm"
          />
        </div>

      </div>
    </ActionDetailsWrapper>
  );
}
