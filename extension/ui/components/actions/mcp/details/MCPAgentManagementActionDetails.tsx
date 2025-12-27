import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { ActionRobotIcon } from "@dust-tt/sparkle";

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
