import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

export function getActionOneLineLabel(
  action: AgentMCPActionWithOutputType,
  context: "running" | "done" = "done"
): string {
  if (action.displayLabels) {
    return action.displayLabels[context];
  }
  return action.functionCallName
    ? asDisplayName(action.functionCallName)
    : "Tool";
}
