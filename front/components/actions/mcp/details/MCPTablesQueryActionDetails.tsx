import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { CodeBlock, TableIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import {
  SqlQueryBlock,
  ThinkingBlock,
  ToolGeneratedFileDetails,
} from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isExecuteTablesQueryErrorResourceType,
  isSqlQueryOutput,
  isThinkingOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPTablesQueryActionDetails({
  action,
  defaultOpen,
  owner,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const thinkingBlocks =
    action.output?.filter(isThinkingOutput).map((o) => o.resource) ?? [];
  const sqlQueryBlocks =
    action.output?.filter(isSqlQueryOutput).map((o) => o.resource) ?? [];
  const generatedFiles =
    action.output?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];
  const errorBlocks =
    action.output
      ?.filter(isExecuteTablesQueryErrorResourceType)
      .map((o) => o.resource) ?? [];

  // For v2 server, get query from params if no SQL query blocks in output.
  const queryFromParams = action.params?.query as string | undefined;
  const hasQueryToDisplay = sqlQueryBlocks.length > 0 || queryFromParams;

  return (
    <ActionDetailsWrapper
      actionName="Query tables"
      defaultOpen={defaultOpen}
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        {thinkingBlocks.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Reasoning
            </span>
            {thinkingBlocks.map((block) => (
              <ThinkingBlock key={block.text} resource={block} />
            ))}
          </div>
        )}

        {hasQueryToDisplay && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Query
            </span>
            {sqlQueryBlocks.length > 0
              ? sqlQueryBlocks.map((block) => (
                  <SqlQueryBlock key={block.text} resource={block} />
                ))
              : queryFromParams && (
                  <SqlQueryBlock
                    resource={{
                      text: queryFromParams,
                      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.SQL_QUERY,
                      uri: "",
                    }}
                  />
                )}
          </div>
        )}

        {generatedFiles.length > 0 && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Results
            </span>
            {generatedFiles.map((file) => (
              <ToolGeneratedFileDetails
                key={file.fileId}
                resource={file}
                icon={TableIcon}
                owner={owner}
              />
            ))}
          </div>
        )}

        {errorBlocks.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Error
            </span>
            {errorBlocks.map((block, index) => (
              <CodeBlock
                key={`execute-tables-query-error-${action.id}-${index}`}
                wrapLongLines
              >
                {block.text}
              </CodeBlock>
            ))}
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
