import type { SkillType } from "@app/types/assistant/skill_configuration";
import { z } from "zod";

export type FetchConversationSkillsResponse = {
  skills: SkillType[];
};

export const ConversationSkillActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  skillId: z.string(),
});

export type ConversationSkillActionRequest = z.infer<
  typeof ConversationSkillActionRequestSchema
>;
