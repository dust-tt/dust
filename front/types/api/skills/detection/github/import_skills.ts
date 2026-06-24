import { z } from "zod";

export const ImportSkillsRequestBodySchema = z.object({
  repoUrl: z.string(),
  names: z.array(z.string()),
});

export type ImportSkillsRequestBody = z.infer<
  typeof ImportSkillsRequestBodySchema
>;
