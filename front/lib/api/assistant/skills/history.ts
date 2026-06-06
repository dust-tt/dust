// Contract types for the skill history endpoint
// (`/api/w/:wId/skills/:sId/history`). Shared by the Next.js handler and its
// Hono counterpart so both rely on a single source of truth.
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";

export type GetSkillHistoryResponseBody = {
  history: SkillWithVersionType[];
};
