// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { CodeBlock, TableIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import {
  SqlQueryBlock,
  ThinkingBlock,
  ToolGeneratedFileDetails,
} from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isExecuteTablesQueryErrorResourceType,
  isSqlQueryOutput,
  isThinkingOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPTablesQueryActionDetails({
  toolOutput,
  toolParams,
  viewType,
  owner,
}: ToolExecutionDetailsProps) {
  const thinkingBlocks =
    toolOutput?.filter(isThinkingOutput).map((o) => o.resource) ?? [];
  const sqlQueryBlocks =
    toolOutput?.filter(isSqlQueryOutput).map((o) => o.resource) ?? [];
  const generatedFiles =
    toolOutput
      ?.filter(isToolGeneratedFile)
      .map((o) => o.resource)
      .filter((r) => !("hidden" in r && r.hidden)) ?? [];
  const errorBlocks =
    toolOutput
      ?.filter(isExecuteTablesQueryErrorResourceType)
      .map((o) => o.resource) ?? [];

  // For v2 server, get query from params if no SQL query blocks in output.
  const queryFromParams = toolParams?.query as string | undefined;
  const hasQueryToDisplay = sqlQueryBlocks.length > 0 || queryFromParams;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Querying tables" : "Query tables"
      }
      visual={TableIcon}
    >
      {viewType === "conversation" ? (
        thinkingBlocks.length > 0 && (
          <div className="flex flex-col gap-4 pl-6 pt-4">
            {thinkingBlocks.map((block) => (
              <div key={block.text}>{block.text}</div>
            ))}
          </div>
        )
      ) : (
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
                  key={`execute-tables-query-error-${index}`}
                  wrapLongLines
                >
                  {block.text}
                </CodeBlock>
              ))}
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
