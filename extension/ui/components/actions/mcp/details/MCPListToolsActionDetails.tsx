import { BoltIcon } from "@dust-tt/sparkle";
import { ActionDetailsWrapper } from "@extension/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@extension/ui/components/actions/mcp/details/MCPActionDetails";

export function MCPListToolsActionDetails({ viewType }: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Listing tools" : "List tools"}
      visual={BoltIcon}
    />
  );
}
