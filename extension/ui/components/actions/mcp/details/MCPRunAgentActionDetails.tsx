import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { RobotIcon } from "@dust-tt/sparkle";

export function MCPRunAgentActionDetails({
  action: { toolName },
  viewType,
}: MCPActionDetailsProps) {
  // Hack to find the agent name. In the web app we fetch the child agent.
  const runAgentPrefix = "run_";
  const agentHandle = toolName.startsWith(runAgentPrefix)
    ? `@${toolName.slice(runAgentPrefix.length)}`
    : "sub-agent";

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? `Running ${agentHandle}`
          : `Run ${agentHandle}`
      }
      visual={RobotIcon}
    />
  );
}
