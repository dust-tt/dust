import { z } from "zod";

export const REASONING_EFFORTS = [
  "none",
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export const REASONING_DETAILS_LEVELS = ["low", "high"] as const;
export type ReasoningDetailsLevel = (typeof REASONING_DETAILS_LEVELS)[number];

export const reasoningEffortSchema = z.enum(REASONING_EFFORTS);
export const reasoningDetailsSchema = z.enum(REASONING_DETAILS_LEVELS);
export const reasoningSchema = z.object({
  effort: reasoningEffortSchema,
  details: reasoningDetailsSchema,
});
export const temperatureSchema = z.number().min(0).max(1);
export const maxOutputTokensSchema = z.number().min(0);
export const topProbabilitySchema = z.number().min(0).max(1);
export const topLogprobsSchema = z.number().min(0);

// export const requiredConfigSchema = z.object({
//   temperature: temperatureSchema,
//   maxOutputTokens: maxOutputTokensSchema,
//   reasoningEffort: reasoningEffortSchema,
//   reasoningDetailsLevel: reasoningDetailsSchema,
// });
export const configInputSchema = z.object({
  temperature: temperatureSchema.optional(),
  maxOutputTokens: maxOutputTokensSchema.nullable().optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  reasoningDetailsLevel: reasoningDetailsSchema.optional(),
  topProbability: topProbabilitySchema.optional(),
  topLogprobs: topLogprobsSchema.optional(),
});

export type InputConfig = z.infer<typeof configInputSchema>;
