import {
  ADJUST_REASONING_EFFORT_TOOL_NAME,
  SELF_CONFIGURATION_SERVER_NAME,
} from "@app/lib/api/actions/servers/self_configuration/metadata";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { EffortChangeMessageTypeModel } from "@app/types/assistant/generation";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

const ReasoningEffortChangeResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.REASONING_EFFORT_CHANGE),
  uri: z.literal(""),
  text: z.string(),
  from: z.enum(ORDERED_REASONING_EFFORTS),
  to: z.enum(ORDERED_REASONING_EFFORTS),
});

type ReasoningEffortChangeResourceType = z.infer<
  typeof ReasoningEffortChangeResourceSchema
>;

// Output of a succeeded `adjust_reasoning_effort` call: the effort it switches from and to, resolved
// once by the tool, along with the text the model reads.
export function makeReasoningEffortChangeOutput({
  from,
  to,
  text,
}: {
  from: ReasoningEffort;
  to: ReasoningEffort;
  text: string;
}): {
  type: "resource";
  resource: ReasoningEffortChangeResourceType;
} {
  return {
    type: "resource",
    resource: {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.REASONING_EFFORT_CHANGE,
      uri: "",
      text,
      from,
      to,
    },
  };
}

/**
 * @cc [owner:aubin-tchoi,label:product;performance] effort-change-rendered-as-resolved
 * Returns the message injected after the step of a succeeded `adjust_reasoning_effort` action,
 * carrying the effort its output resolved (`to`), or null for any other action. It MUST render that
 * effort as is, without resolving effort levels again: the tool resolves them once, so the rendered
 * conversation stays the same on every later request and the cached prefix holds.
 */
export function renderEffortChangeMessageForAction(
  action: AgentMCPActionWithOutputType
): EffortChangeMessageTypeModel | null {
  if (
    action.internalMCPServerName !== SELF_CONFIGURATION_SERVER_NAME ||
    action.toolName !== ADJUST_REASONING_EFFORT_TOOL_NAME
  ) {
    return null;
  }

  for (const block of action.output ?? []) {
    if (block.type !== "resource") {
      continue;
    }
    const resource = ReasoningEffortChangeResourceSchema.safeParse(
      block.resource
    );
    if (resource.success) {
      return {
        role: "effort_change",
        from: resource.data.from,
        effort: resource.data.to,
      };
    }
  }

  return null;
}
