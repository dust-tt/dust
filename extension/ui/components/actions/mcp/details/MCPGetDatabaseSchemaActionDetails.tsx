import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { TableIcon } from "@dust-tt/sparkle";

export function MCPGetDatabaseSchemaActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Getting database schema"
          : "Get database schema"
      }
      visual={TableIcon}
    >
      <></>
    </ActionDetailsWrapper>
  );
}
