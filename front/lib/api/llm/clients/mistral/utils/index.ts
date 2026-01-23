import type { ToolChoice } from "@mistralai/mistralai/models/components";
import type { ToolChoiceEnum } from "@mistralai/mistralai/models/components/toolchoiceenum";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";

export function toToolChoiceParam(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined
): ToolChoice | ToolChoiceEnum {
  return forceToolCall && specifications.some((s) => s.name === forceToolCall)
    ? { type: "function", function: { name: forceToolCall } }
    : ("auto" as const);
}
