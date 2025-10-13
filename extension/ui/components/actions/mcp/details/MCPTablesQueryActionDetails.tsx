import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { isThinkingOutput } from "@dust-tt/client";
import { TableIcon } from "@dust-tt/sparkle";

export function MCPTablesQueryActionDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const thinkingBlocks =
    action.output?.filter(isThinkingOutput).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Querying tables" : "Query tables"
      }
      visual={TableIcon}
    >
      {viewType === "conversation" && (
        <>
          {thinkingBlocks.length > 0 && (
            <div className="flex flex-col gap-4 pl-6 pt-4">
              {thinkingBlocks.map((block) => (
                <div key={block.text}>{block.text}</div>
              ))}
            </div>
          )}
        </>
      )}
    </ActionDetailsWrapper>
  );
}
