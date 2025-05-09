import { TableIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import {
  SqlQueryBlock,
  ThinkingBlock,
  ToolGeneratedFileDetails,
} from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isSqlQueryOutput,
  isThinkingOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPTablesQueryActionDetails({
  action,
  defaultOpen,
  owner,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const { output } = action;
  const thinkingBlocks =
    output?.filter(isThinkingOutput).map((o) => o.resource) ?? [];

  const sqlQueryBlocks =
    output?.filter(isSqlQueryOutput).map((o) => o.resource) ?? [];

  const generatedFiles =
    output?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      actionName="Query tables"
      defaultOpen={defaultOpen}
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Reasoning
          </span>
          {thinkingBlocks.map((block) => (
            <ThinkingBlock key={block.text} resource={block} />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Query
          </span>
          {sqlQueryBlocks.map((block) => (
            <SqlQueryBlock key={block.text} resource={block} />
          ))}
        </div>

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
      </div>
    </ActionDetailsWrapper>
  );
}
