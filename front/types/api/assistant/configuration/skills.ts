import { SkillSchema } from "@app/types/assistant/skill_configuration";
import { z } from "zod";

export const GetAgentSkillsResponseBodySchema = z.object({
  skills: z.array(SkillSchema),
});
export type GetAgentSkillsResponseBody = z.infer<
  typeof GetAgentSkillsResponseBodySchema
>;
