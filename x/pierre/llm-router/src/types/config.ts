import { z } from "zod";

export const ORDERED_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "maximal",
] as const;
export type ReasoningEffort = (typeof ORDERED_REASONING_EFFORTS)[number];
export const reasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);

export const reasoningSchema = z.object({
  effort: reasoningEffortSchema,
});
export const temperatureSchema = z.number().min(0).max(1);
export const maxOutputTokensSchema = z
  .number()
  .min(0)
  .max(Number.POSITIVE_INFINITY);

export const toolSpecificationSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});
export type ToolSpecification = z.infer<typeof toolSpecificationSchema>;

export const inputConfigSchema = z.object({
  temperature: temperatureSchema.optional(),
  reasoning: reasoningSchema.optional(),
  tools: z.array(toolSpecificationSchema).optional(),
  forceTool: z.string().optional(),
});

export type InputConfig = z.infer<typeof inputConfigSchema>;
