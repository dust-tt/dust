import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { LightWorkspaceType } from "@app/types/user";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ActionDetailsDisplayContext =
  | "conversation"
  // TODO(2026-04-07 inline activity): the "all actions" display will be deprecated with the ship of inline activity.
  | "sidebar-all-actions"
  | "sidebar-single-action";

// Generic interface for every component that displays details for a certain type of tool output.
export interface ToolExecutionDetailsProps {
  lastNotification: ProgressNotificationContentType | null;
  messageStatus?:
    | "created"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "gracefully_stopped";
  owner: LightWorkspaceType;
  toolOutput: CallToolResult["content"] | null;
  toolParams: Record<string, unknown>;
  displayContext: ActionDetailsDisplayContext;
}
