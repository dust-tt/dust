import type { TaskCardSource } from "@connectors/connectors/slack/chat/blocks";
import {
  type AgentActionPublicType,
  type NotificationRunAgentContent,
  NotificationRunAgentContentSchema,
  TOOL_RUNNING_LABEL,
  type ToolNotificationEvent,
} from "@dust-tt/client";
import { z } from "zod";

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

const SearchParamsSchema = z.object({ query: z.string() });
const BrowseParamsSchema = z.object({ urls: z.array(z.string().url()) });
const SourceResourceSchema = z.object({
  uri: z.string().url(),
  title: z.string(),
});

export function getActionDetails(
  action: AgentActionPublicType
): string | undefined {
  const search = SearchParamsSchema.safeParse(action.params);
  if (search.success) {
    return search.data.query;
  }
  const browse = BrowseParamsSchema.safeParse(action.params);
  if (browse.success) {
    return browse.data.urls.map((url) => new URL(url).hostname).join(", ");
  }
  return undefined;
}

export function getActionSources(
  action: AgentActionPublicType
): TaskCardSource[] | undefined {
  if (!action.output) {
    return undefined;
  }
  const sources: TaskCardSource[] = [];
  for (const block of action.output) {
    if (block.type === "resource" && "resource" in block) {
      const result = SourceResourceSchema.safeParse(block.resource);
      if (result.success) {
        sources.push({ url: result.data.uri, text: result.data.title });
      }
    }
  }
  return sources.length > 0 ? sources : undefined;
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
