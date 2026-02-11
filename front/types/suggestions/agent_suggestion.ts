import { z } from "zod";

import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MODEL_IDS } from "@app/types/assistant/models/models";
import { REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewType } from "@app/types/data_source_view";

export const AGENT_SUGGESTION_KINDS = [
  "instructions",
  "tools",
  "sub_agent",
  "skills",
  "model",
  "knowledge",
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

export const INSTRUCTIONS_ROOT_TARGET_BLOCK_ID = "instructions-root";

const ToolsSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  toolId: z.string(),
});

const SubAgentSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  toolId: z.string(),
  childAgentId: z.string(),
});

const SkillsSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  skillId: z.string(),
});

const InstructionsSuggestionSchema = z.object({
  content: z
    .string()
    .describe("The full HTML content for this block, including the tag"),
  targetBlockId: z
    .string()
    .describe("The data-block-id of the block to modify"),
  type: z
    .enum(["replace"])
    .describe("The type of modification to perform on the target block"),
});

const ModelSuggestionSchema = z.object({
  modelId: z.enum(MODEL_IDS),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
});

const KnowledgeSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  dataSourceViewId: z.string(),
});

export type ToolsSuggestionType = z.infer<typeof ToolsSuggestionSchema>;
export type SubAgentSuggestionType = z.infer<typeof SubAgentSuggestionSchema>;
export type SkillsSuggestionType = z.infer<typeof SkillsSuggestionSchema>;
export type InstructionsSuggestionSchemaType = z.infer<
  typeof InstructionsSuggestionSchema
>;
export type ModelSuggestionType = z.infer<typeof ModelSuggestionSchema>;
export type KnowledgeSuggestionType = z.infer<
  typeof KnowledgeSuggestionSchema
>;

export function isToolsSuggestion(data: unknown): data is ToolsSuggestionType {
  return ToolsSuggestionSchema.safeParse(data).success;
}

export function isSubAgentSuggestion(
  data: unknown
): data is SubAgentSuggestionType {
  return SubAgentSuggestionSchema.safeParse(data).success;
}

export function isSkillsSuggestion(
  data: unknown
): data is SkillsSuggestionType {
  return SkillsSuggestionSchema.safeParse(data).success;
}

export function isModelSuggestion(data: unknown): data is ModelSuggestionType {
  return ModelSuggestionSchema.safeParse(data).success;
}

export function isKnowledgeSuggestion(
  data: unknown
): data is KnowledgeSuggestionType {
  return KnowledgeSuggestionSchema.safeParse(data).success;
}

export type SuggestionPayload =
  | InstructionsSuggestionSchemaType
  | KnowledgeSuggestionType
  | ModelSuggestionType
  | SkillsSuggestionType
  | SubAgentSuggestionType
  | ToolsSuggestionType;

export const AgentSuggestionDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tools"), suggestion: ToolsSuggestionSchema }),
  z.object({
    kind: z.literal("sub_agent"),
    suggestion: SubAgentSuggestionSchema,
  }),
  z.object({ kind: z.literal("skills"), suggestion: SkillsSuggestionSchema }),
  z.object({
    kind: z.literal("instructions"),
    suggestion: InstructionsSuggestionSchema,
  }),
  z.object({ kind: z.literal("model"), suggestion: ModelSuggestionSchema }),
  z.object({
    kind: z.literal("knowledge"),
    suggestion: KnowledgeSuggestionSchema,
  }),
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

export const AgentSuggestionSchema = BaseAgentSuggestionSchema.and(
  AgentSuggestionDataSchema
);

export type AgentSuggestionType = z.infer<typeof AgentSuggestionSchema>;

export type AgentInstructionsSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "instructions" }
>;

export interface ToolSuggestionRelations {
  tool: MCPServerViewType;
}

export interface SubAgentSuggestionRelations {
  tool: MCPServerViewType;
}

export interface SkillSuggestionRelations {
  skill: SkillType;
}

export interface ModelSuggestionRelations {
  model: ModelConfigurationType;
}

export interface KnowledgeSuggestionRelations {
  dataSourceView: DataSourceViewType;
}

export type AgentSuggestionWithRelationsType =
  | (Extract<AgentSuggestionType, { kind: "tools" }> & {
      relations: ToolSuggestionRelations;
    })
  | (Extract<AgentSuggestionType, { kind: "sub_agent" }> & {
      relations: SubAgentSuggestionRelations;
    })
  | (Extract<AgentSuggestionType, { kind: "skills" }> & {
      relations: SkillSuggestionRelations;
    })
  | (Extract<AgentSuggestionType, { kind: "model" }> & {
      relations: ModelSuggestionRelations;
    })
  | (Extract<AgentSuggestionType, { kind: "knowledge" }> & {
      relations: KnowledgeSuggestionRelations;
    })
  | (AgentInstructionsSuggestionType & {
      relations: null;
    });
