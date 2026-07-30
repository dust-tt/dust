import { z } from "zod";

export const GetUserMemoryResponseBodySchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
});
export type GetUserMemoryResponseBody = z.infer<
  typeof GetUserMemoryResponseBodySchema
>;

export const PatchUserMemoryResponseBodySchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
});
export type PatchUserMemoryResponseBody = z.infer<
  typeof PatchUserMemoryResponseBodySchema
>;
