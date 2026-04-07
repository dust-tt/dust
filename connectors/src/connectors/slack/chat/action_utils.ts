import {
  type AgentActionPublicType,
  type NotificationRunAgentContent,
  NotificationRunAgentContentSchema,
  TOOL_RUNNING_LABEL,
  type ToolNotificationEvent,
} from "@dust-tt/client";

// run_agent actions have null displayLabels due to a gap in the server-side
// tool type system (ServerSideMCPToolType doesn't carry displayLabels).
// Fall back to the label defined in the run_agent server metadata.
const RUN_AGENT_RUNNING_LABEL = "Running agent";

export function getActionRunningLabel(action: AgentActionPublicType): string {
  if (action.displayLabels?.running) {
    return action.displayLabels.running;
  }
  if (action.internalMCPServerName === "run_agent") {
    return RUN_AGENT_RUNNING_LABEL;
  }
  return TOOL_RUNNING_LABEL;
}

export function getActionDoneLabel(action: AgentActionPublicType): string {
  return action.displayLabels?.done ?? "Done";
}

export function getRunAgentNotificationOutput(
  event: ToolNotificationEvent
): NotificationRunAgentContent | null {
  if (event.action.internalMCPServerName !== "run_agent") {
    return null;
  }
  const result = NotificationRunAgentContentSchema.safeParse(
    event.notification._meta.data.output
  );
  if (!result.success || !result.data.agentMessageId) {
    return null;
  }
  return result.data;
}
