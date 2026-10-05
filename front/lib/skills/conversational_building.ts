import { getConversationRoute } from "@app/lib/utils/router";

// sId of the code-defined `conversationalBuildingSkill` (server-side, not importable here).
export const CONVERSATIONAL_BUILDING_SKILL_ID = "conversational-building";

export type ConversationalBuildingTarget = "agent" | "skill";

export function isConversationalBuildingTarget(
  value: string | null
): value is ConversationalBuildingTarget {
  return value === "agent" || value === "skill";
}

// Text appended after the skill tag when prefilling the composer from ?create=.
export function getConversationalBuildingCreatePrompt(
  target: ConversationalBuildingTarget
): string {
  return `to help me create a new ${target}`;
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
