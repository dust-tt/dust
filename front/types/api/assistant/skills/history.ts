// Contract types for the skill history endpoint
// (`/api/w/:wId/skills/:sId/history`). Used by the skill history route so it
// relies on a single source of truth.
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";

export type GetSkillHistoryResponseBody = {
  history: SkillWithVersionType[];
};
