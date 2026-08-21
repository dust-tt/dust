import type { SkillType } from "@app/types/assistant/skill_configuration";
import { z } from "zod";

export const ImportSkillsRequestBodySchema = z.object({
  repoUrl: z.string(),
  names: z.array(z.string()),
});

export type ImportSkillsRequestBody = z.infer<
  typeof ImportSkillsRequestBodySchema
>;

export type ImportSkillsResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  skipped: { name: string; message: string }[];
};
