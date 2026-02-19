import { ActionRobotIcon } from "@dust-tt/sparkle";
import { ActionDetailsWrapper } from "@extension/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@extension/ui/components/actions/mcp/details/MCPActionDetails";

export function MCPAgentManagementActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Creating agent" : "Create Agent"
      }
      visual={ActionRobotIcon}
    />
  );
}
