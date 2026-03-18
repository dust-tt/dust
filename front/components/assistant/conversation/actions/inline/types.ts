import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

export type CompletedStep =
  | { type: "thinking"; content: string; id: string }
  | { type: "action"; action: AgentMCPActionWithOutputType; id: string };

export function getActionOneLineLabel(
  action: AgentMCPActionWithOutputType
): string {
  if (action.displayLabels) {
    return action.displayLabels.done;
  }
  return action.functionCallName
    ? asDisplayName(action.functionCallName)
    : "Tool";
}
