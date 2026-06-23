import { z } from "zod";

export const GetSkillHistoryQuerySchema = z.object({
  limit: z.number().min(0).max(100).optional(),
});
