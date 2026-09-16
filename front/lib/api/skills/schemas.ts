import { SKILL_NAME_MAX_LENGTH } from "@app/types/assistant/skill_configuration_constants";
import { z } from "zod";

/**
 * @cc [owner:aubin-tchoi,label:product] skill-name-length
 * Skill creation and renaming must reject names longer than 256 characters.
 */
export const SkillNameSchema = z
  .string()
  .max(
    SKILL_NAME_MAX_LENGTH,
    `Skill names must be at most ${SKILL_NAME_MAX_LENGTH} characters.`
  );

// Schema for knowledge attached to a skill.
export const AttachedKnowledgeSchema = z.object({
  dataSourceViewId: z.string(),
  nodeId: z.string(),
  spaceId: z.string(),
  title: z.string(),
});
