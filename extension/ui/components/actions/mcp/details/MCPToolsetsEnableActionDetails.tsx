import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { BoltIcon } from "@dust-tt/sparkle";

export function MCPToolsetsEnableActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Enabled tool" : "Enable tool"}
      visual={BoltIcon}
    />
  );
}
