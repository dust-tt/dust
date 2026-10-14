import { parseIntParam } from "@app/lib/api/pagination";
import { z } from "zod";

export const GetSkillHistoryQuerySchema = z.object({
  limit: z.preprocess(parseIntParam, z.number().min(0).max(100).optional()),
});
