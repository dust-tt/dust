import { z } from "zod";

export const ConversationSkillActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  skillId: z.string(),
});
