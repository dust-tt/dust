import type { DetectedSkill } from "@app/lib/api/skills/github_detection/types";

export type DetectedSkillStatus = "ready" | "name_conflict" | "invalid";

export interface DetectedSkillWithStatus extends DetectedSkill {
  status: DetectedSkillStatus;
  existingSkillId: string | null;
}

export interface DetectedSkillSummary {
  name: string;
  status: DetectedSkillStatus;
  existingSkillId: string | null;
}
