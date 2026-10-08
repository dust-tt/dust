import { getConversationRoute } from "@app/lib/utils/router";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// sId of the code-defined `conversationalBuildingSkill` (server-side, not importable here).
export const CONVERSATIONAL_BUILDING_SKILL_ID = "conversational-building";

export type ConversationalBuildingTarget = "agent" | "skill";

export function isConversationalBuildingTarget(
  value: string | null
): value is ConversationalBuildingTarget {
  return value === "agent" || value === "skill";
}

// Composer prefill for ?create=, referencing the building skill through its serialized tag.
export function getConversationalBuildingCreatePrompt(
  target: ConversationalBuildingTarget,
  skillTag: string
): MessageDescriptor {
  switch (target) {
    case "agent":
      return msg`Use ${skillTag} to help me create a new agent`;
    case "skill":
      return msg`Use ${skillTag} to help me create a new skill`;
  }
}

// New conversation prefilled with the building skill and a prompt to create an agent or skill.
export function getCreateFromConversationRoute(
  workspaceId: string,
  target: ConversationalBuildingTarget
): string {
  return getConversationRoute(
    workspaceId,
    "new",
    `skill=${CONVERSATIONAL_BUILDING_SKILL_ID}&create=${target}`
  );
}
