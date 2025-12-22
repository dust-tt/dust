import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { BoltIcon } from "@dust-tt/sparkle";

export function MCPListToolsActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Listing tools" : "List tools"}
      visual={BoltIcon}
    />
  );
}
