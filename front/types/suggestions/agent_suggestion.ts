import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MODEL_IDS } from "@app/types/assistant/models/models";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { z } from "zod";

export const AGENT_SUGGESTION_KINDS = [
  "instructions",
  "tools",
  "sub_agent",
  "skills",
  "model",
  "knowledge",
  "create",
  "delete",
  "name",
  "description",
  "scope",
] as const;

export type AgentSuggestionKind = (typeof AGENT_SUGGESTION_KINDS)[number];

export const AGENT_SUGGESTION_STATES = [
  "pending",
  "approved",
  "rejected",
  "outdated",
] as const;

export type AgentSuggestionState = (typeof AGENT_SUGGESTION_STATES)[number];

// - `sidekick`: proposed while editing a specific agent.
// - `conversational`: proposed by an agent during a regular conversation.
export const AGENT_SUGGESTION_SOURCES = ["sidekick", "conversational"] as const;

export type AgentSuggestionSource = (typeof AGENT_SUGGESTION_SOURCES)[number];

export function isAgentSuggestionSource(
  value: unknown
): value is AgentSuggestionSource {
  return (
    typeof value === "string" &&
    AGENT_SUGGESTION_SOURCES.includes(value as AgentSuggestionSource)
  );
}

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
  reasoningEffort: z.enum(ORDERED_REASONING_EFFORTS).optional(),
});

const CreateSuggestionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .describe("Unique, human-readable agent name (no leading '@')."),
  description: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Short description of what the agent does, shown to users browsing agents."
    ),
  instructions: z
    .string()
    .trim()
    .min(1)
    .describe("The agent's instructions, as HTML."),
});

const DeleteSuggestionSchema = z.object({
  name: z.string().trim().min(1).describe("Name of the agent to delete."),
});

const NameSuggestionSchema = z.object({
  name: z.string().trim().min(1),
});

const DescriptionSuggestionSchema = z.object({
  description: z.string().trim().min(1),
});

const ScopeSuggestionSchema = z.object({
  scope: z.enum(["hidden", "visible"]),
});

const KNOWLEDGE_SUGGESTION_METHODS = ["search", "query_tables"] as const;
const KnowledgeSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  method: z
    .enum(KNOWLEDGE_SUGGESTION_METHODS)
    .optional()
    .default("search")
    .describe(
      "'Search' for semantic search on unstructured data. 'Query table' to generate SQL-like queries against structured data."
    ),
  dataSourceViewId: z.string(),
  nodeIds: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export type ToolsSuggestionType = z.infer<typeof ToolsSuggestionSchema>;
export type SubAgentSuggestionType = z.infer<typeof SubAgentSuggestionSchema>;
export type SkillsSuggestionType = z.infer<typeof SkillsSuggestionSchema>;
export type InstructionsSuggestionSchemaType = z.infer<
  typeof InstructionsSuggestionSchema
>;
export type ModelSuggestionType = z.infer<typeof ModelSuggestionSchema>;
export type KnowledgeSuggestionType = z.infer<typeof KnowledgeSuggestionSchema>;
export type CreateSuggestionType = z.infer<typeof CreateSuggestionSchema>;
export type DeleteSuggestionType = z.infer<typeof DeleteSuggestionSchema>;
export type DescriptionSuggestionType = z.infer<
  typeof DescriptionSuggestionSchema
>;
export type NameSuggestionType = z.infer<typeof NameSuggestionSchema>;
export type ScopeSuggestionType = z.infer<typeof ScopeSuggestionSchema>;

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

export function isKnowledgeSuggestion(
  data: unknown
): data is KnowledgeSuggestionType {
  return KnowledgeSuggestionSchema.safeParse(data).success;
}

export type SuggestionPayload =
  | CreateSuggestionType
  | DeleteSuggestionType
  | DescriptionSuggestionType
  | InstructionsSuggestionSchemaType
  | KnowledgeSuggestionType
  | ModelSuggestionType
  | NameSuggestionType
  | ScopeSuggestionType
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
  z.object({ kind: z.literal("create"), suggestion: CreateSuggestionSchema }),
  z.object({ kind: z.literal("delete"), suggestion: DeleteSuggestionSchema }),
  z.object({ kind: z.literal("name"), suggestion: NameSuggestionSchema }),
  z.object({
    kind: z.literal("description"),
    suggestion: DescriptionSuggestionSchema,
  }),
  z.object({ kind: z.literal("scope"), suggestion: ScopeSuggestionSchema }),
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
  conversationId: z.string().nullable(),
});

export const AgentSuggestionSchema = BaseAgentSuggestionSchema.and(
  AgentSuggestionDataSchema
);

export type AgentSuggestionType = z.infer<typeof AgentSuggestionSchema>;

export type AgentInstructionsSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "instructions" }
>;

export type AgentToolsSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "tools" }
>;

export type AgentSubAgentSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "sub_agent" }
>;

export type AgentSkillsSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "skills" }
>;

export type AgentModelSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "model" }
>;

export type AgentKnowledgeSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "knowledge" }
>;

export type AgentCreateSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "create" }
>;

export type AgentDeleteSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "delete" }
>;

export type AgentDescriptionSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "description" }
>;

export type AgentNameSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "name" }
>;

export type AgentScopeSuggestionType = Extract<
  AgentSuggestionType,
  { kind: "scope" }
>;

export interface ToolSuggestionRelations {
  tool: MCPServerViewType;
}

export interface SubAgentSuggestionRelations {
  tool: MCPServerViewType;
}

export interface SkillSuggestionRelations {
  skill: SkillWithoutInstructionsAndToolsType;
}

export interface ModelSuggestionRelations {
  model: ModelConfigurationType;
}

export interface KnowledgeSuggestionRelations {
  dataSourceView: DataSourceViewType;
  serverView: MCPServerViewType;
}

export type AgentToolsSuggestionWithRelationsType = AgentToolsSuggestionType & {
  relations: ToolSuggestionRelations;
};

export type AgentSubAgentSuggestionWithRelationsType =
  AgentSubAgentSuggestionType & { relations: SubAgentSuggestionRelations };

export type AgentSkillsSuggestionWithRelationsType =
  AgentSkillsSuggestionType & { relations: SkillSuggestionRelations };

export type AgentModelSuggestionWithRelationsType = AgentModelSuggestionType & {
  relations: ModelSuggestionRelations;
};

export type AgentKnowledgeSuggestionWithRelationsType =
  AgentKnowledgeSuggestionType & { relations: KnowledgeSuggestionRelations };

export type AgentSuggestionWithRelationsType =
  | (AgentCreateSuggestionType & { relations: null })
  | (AgentDeleteSuggestionType & { relations: null })
  | (AgentDescriptionSuggestionType & { relations: null })
  | (AgentInstructionsSuggestionType & { relations: null })
  | AgentKnowledgeSuggestionWithRelationsType
  | AgentModelSuggestionWithRelationsType
  | (AgentNameSuggestionType & { relations: null })
  | (AgentScopeSuggestionType & { relations: null })
  | AgentSkillsSuggestionWithRelationsType
  | AgentSubAgentSuggestionWithRelationsType
  | AgentToolsSuggestionWithRelationsType;
