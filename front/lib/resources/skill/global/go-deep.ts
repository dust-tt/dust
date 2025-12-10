import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const goDeepSkill = {
  sId: "framess",
  name: "Frames",
  description: "Frame handling skill",
  instructions: "Handle frame-related operations",
  version: 1,
} as const satisfies GlobalSkillDefinition;
