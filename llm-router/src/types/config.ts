import { valueSchema } from "@/types/utils";
import { z } from "zod";

export const CONFIG_SCHEMA = z.object({
  temperature: valueSchema(z.number().min(0).max(1)).optional(),
  maxOutputTokens: valueSchema(z.number().min(1)).optional(),
});

export type Config = z.infer<typeof CONFIG_SCHEMA>;
