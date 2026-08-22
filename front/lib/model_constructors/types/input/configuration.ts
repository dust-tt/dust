import { ORDERED_REASONING_EFFORTS } from "@app/lib/model_constructors/types/reasoning_efforts";
import { z } from "zod";

export const reasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);

export const reasoningSchema = z.object({
  effort: reasoningEffortSchema,
});
export type Reasoning = z.infer<typeof reasoningSchema>;

export const temperatureSchema = z.number().min(0).max(1);
export const maxOutputTokensSchema = z.number().min(0);

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
  // Whether this tool is loaded upfront in the cached prefix. Intrinsic,
  // provider-agnostic property. Providers with tool search defer non-eager
  // tools when tool search is enabled.
  eager: z.boolean().optional(),
});
export type ToolSpecification = z.infer<typeof toolSpecificationSchema>;

// In practice we use only flex and auto but others are included for completeness.
// Only used by OpenAI
const serviceTierSchema = z.enum([
  "auto",
  "default",
  "flex",
  "scale",
  "priority",
]);
export type ServiceTier = z.infer<typeof serviceTierSchema>;

export const inputConfigSchema = z.object({
  temperature: temperatureSchema.optional(),
  reasoning: reasoningSchema.optional(),
  conciseReasoningSummary: z.boolean().optional(),
  tools: z.array(toolSpecificationSchema).optional(),
  forceTool: z.string().optional(),
  // When true, the tools are sent but the model is forbidden from calling them
  // (tool choice "none"). Used to force a final generation while keeping the
  // request's tool definitions stable across steps. Mutually exclusive with `forceTool`.
  disableToolUse: z.boolean().optional(),
  // When true, supporting provider clients defer non-eager tools behind tool
  // search.
  toolSearchEnabled: z.boolean().optional(),
  outputFormat: outputFormatSchema.optional(),
  cacheKey: z.string().optional(),
  serviceTier: serviceTierSchema.optional(),
});
export type InputConfig = z.infer<typeof inputConfigSchema>;

// A forced tool and forbidden tool use are contradictory instructions, so the
// type makes them mutually exclusive: setting both is a compile error.
export type ToolChoiceInput =
  | { forceTool?: string; disableToolUse?: never }
  | { forceTool?: never; disableToolUse?: boolean };

// Narrows the flat config fields back into the exclusive union. The zod schema cannot carry the
// union (the provider schemas compose it with .extend), and exclusivity is already guaranteed
// upstream on the stream parameters.
export function toToolChoiceInput({
  forceTool,
  disableToolUse,
}: Pick<InputConfig, "forceTool" | "disableToolUse">): ToolChoiceInput {
  return forceTool !== undefined ? { forceTool } : { disableToolUse };
}
