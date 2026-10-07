import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";

export type GetSimilarSkillsResponseBody = {
  similar_skills: string[];
  skills: SkillWithoutInstructionsAndToolsType[];
};
