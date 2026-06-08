import { ORDERED_REASONING_EFFORTS } from "@app/lib/model_constructors/types/reasoning_efforts";
import { z } from "zod";

export const reasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);

export const reasoningSchema = z.object({
  effort: reasoningEffortSchema,
});
export type Reasoning = z.infer<typeof reasoningSchema>;

export const temperatureSchema = z.number().min(0).max(1);
export const maxOutputTokensSchema = z
  .number()
  .min(0)
  .max(Number.POSITIVE_INFINITY);

export const outputFormatSchema = z.object({
  type: z.literal("json_schema"),
  json_schema: z.object({
    name: z.string(),
    schema: z.object({
      type: z.literal("object"),
      properties: z.record(z.unknown()),
      required: z.array(z.string()),
      additionalProperties: z.boolean(),
    }),
    description: z.string().optional(),
    strict: z.boolean().nullable().optional(),
  }),
});
export type OutputFormat = z.infer<typeof outputFormatSchema>;

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
  outputFormat: outputFormatSchema.optional(),
  cacheKey: z.string().optional(),
});
export type InputConfig = z.infer<typeof inputConfigSchema>;
