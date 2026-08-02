import type { AgentMCPActionType } from "@app/types/actions";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

type ActionWithDisplayLabel = Pick<
  AgentMCPActionType,
  | "displayLabels"
  | "functionCallName"
  | "internalMCPServerName"
  | "params"
  | "toolName"
>;

export function getActionOneLineLabel(
  action: ActionWithDisplayLabel,
  context: "running" | "done" = "done"
): string {
  if (
    action.internalMCPServerName === "sandbox" &&
    action.toolName === "add_egress_domain" &&
    typeof action.params?.domain === "string"
  ) {
    return context === "running"
      ? `Requesting access to ${action.params.domain}`
      : `Request access to ${action.params.domain}`;
  }

  return (
    action.displayLabels?.[context] ??
    (action.functionCallName ? asDisplayName(action.functionCallName) : "Tool")
  );
}
