import { RobotIcon } from "@dust-tt/sparkle";
import { ActionDetailsWrapper } from "@extension/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@extension/ui/components/actions/mcp/details/MCPActionDetails";

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
