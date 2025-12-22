import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { RobotIcon } from "@dust-tt/sparkle";

export function MCPRunAgentActionDetails({
  action: { params },
  viewType,
}: MCPActionDetailsProps) {
  const agentName =
    typeof params.agent === "string" ? params.agent : "sub-agent";

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? `Running @${agentName}`
          : `Run @${agentName}`
      }
      visual={RobotIcon}
    />
  );
}
