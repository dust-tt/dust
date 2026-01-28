import { z } from "zod";

import { MODEL_IDS } from "@app/types/assistant/models/models";
import { REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";

export const AGENT_SUGGESTION_KINDS = [
  "instructions",
  "tools",
  "skills",
  "model",
] as const;

export type AgentSuggestionKind = (typeof AGENT_SUGGESTION_KINDS)[number];

export const AGENT_SUGGESTION_STATES = [
  "pending",
  "approved",
  "rejected",
  "outdated",
] as const;

export type AgentSuggestionState = (typeof AGENT_SUGGESTION_STATES)[number];

export const AGENT_SUGGESTION_SOURCES = ["reinforcement", "copilot"] as const;

export type AgentSuggestionSource = (typeof AGENT_SUGGESTION_SOURCES)[number];

const ToolAdditionSchema = z.object({
  id: z.string(),
  additionalConfiguration: z.record(z.unknown()).optional(),
});

const ToolsSuggestionSchema = z.object({
  additions: z.array(ToolAdditionSchema).optional(),
  deletions: z.array(z.string()).optional(),
});

const SkillsSuggestionSchema = z.object({
  additions: z.array(z.string()).optional(),
  deletions: z.array(z.string()).optional(),
});

const InstructionsSuggestionSchema = z.object({
  oldString: z
    .string()
    .describe("The exact text to find (including surrounding context)"),
  newString: z.string().describe("The exact replacement text"),
  expectedOccurrences: z
    .number()
    .optional()
    .describe("Number of occurrences to replace."),
});

const ModelSuggestionSchema = z.object({
  modelId: z.enum(MODEL_IDS),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
});

export type ToolAdditionType = z.infer<typeof ToolAdditionSchema>;
export type ToolsSuggestionType = z.infer<typeof ToolsSuggestionSchema>;
export type SkillsSuggestionType = z.infer<typeof SkillsSuggestionSchema>;
export type InstructionsSuggestionType = z.infer<
  typeof InstructionsSuggestionSchema
>;
export type ModelSuggestionType = z.infer<typeof ModelSuggestionSchema>;

export function isToolsSuggestion(data: unknown): data is ToolsSuggestionType {
  return ToolsSuggestionSchema.safeParse(data).success;
}

export function isSkillsSuggestion(
  data: unknown
): data is SkillsSuggestionType {
  return SkillsSuggestionSchema.safeParse(data).success;
}

export function isInstructionsSuggestion(
  data: unknown
): data is InstructionsSuggestionType {
  return InstructionsSuggestionSchema.safeParse(data).success;
}

export function isModelSuggestion(data: unknown): data is ModelSuggestionType {
  return ModelSuggestionSchema.safeParse(data).success;
}

export type SuggestionPayload =
  | ToolsSuggestionType
  | SkillsSuggestionType
  | InstructionsSuggestionType
  | ModelSuggestionType;

export const AgentSuggestionDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tools"), suggestion: ToolsSuggestionSchema }),
  z.object({ kind: z.literal("skills"), suggestion: SkillsSuggestionSchema }),
  z.object({
    kind: z.literal("instructions"),
    suggestion: InstructionsSuggestionSchema,
  }),
  z.object({ kind: z.literal("model"), suggestion: ModelSuggestionSchema }),
]);

export type AgentSuggestionData = z.infer<typeof AgentSuggestionDataSchema>;

export function parseAgentSuggestionData(data: unknown): AgentSuggestionData {
  return AgentSuggestionDataSchema.parse(data);
}

const BaseAgentSuggestionSchema = z.object({
  id: z.number(),
  sId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  agentConfigurationId: z.number(),
  analysis: z.string().nullable(),
  state: z.enum(AGENT_SUGGESTION_STATES),
  source: z.enum(AGENT_SUGGESTION_SOURCES),
});

/**
 * Full schema for agent suggestions including base fields and discriminated data.
 */
export const AgentSuggestionSchema = BaseAgentSuggestionSchema.and(
  AgentSuggestionDataSchema
);

/**
 * Discriminated union for agent suggestions based on "kind" field.
 * Use switch(suggestion.kind) to narrow the suggestion type.
 */
export type AgentSuggestionType = z.infer<typeof AgentSuggestionSchema>;
