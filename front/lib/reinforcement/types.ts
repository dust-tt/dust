import type { ToolCallEvent } from "@app/lib/api/llm/types/events";
import { z } from "zod";

export const DESCRIBE_MCP_TOOL_NAME = "describe_mcp" as const;

export type ExploratoryToolName =
  | "get_available_tools"
  | "search_knowledge"
  | typeof DESCRIBE_MCP_TOOL_NAME;

export type TerminalToolName = "edit_skill" | "reject_suggestion";

export const TERMINAL_TOOLS: TerminalToolName[] = [
  "edit_skill",
  "reject_suggestion",
];

export const EXPLORATORY_TOOLS: ExploratoryToolName[] = [
  "get_available_tools",
  "search_knowledge",
  DESCRIBE_MCP_TOOL_NAME,
];

export const ALL_TOOLS = [...TERMINAL_TOOLS, ...EXPLORATORY_TOOLS];

const TERMINAL_TOOL_SET: ReadonlySet<string> = new Set(TERMINAL_TOOLS);
const EXPLORATORY_TOOL_SET: ReadonlySet<string> = new Set(EXPLORATORY_TOOLS);

export function isTerminalToolName(name: string): name is TerminalToolName {
  return TERMINAL_TOOL_SET.has(name);
}

export function isExploratoryToolName(
  name: string
): name is ExploratoryToolName {
  return EXPLORATORY_TOOL_SET.has(name);
}

const SkillInstructionEditArgSchema = z.object({
  targetBlockId: z
    .string()
    .describe(
      'The data-block-id of the block to replace. Use "instructions-root" to replace all instructions.'
    ),
  content: z
    .string()
    .describe(
      "Full replacement content for the block, including its wrapping tag. Must be a single-line string with no literal newlines."
    ),
  type: z.literal("replace"),
});

export const TOOL_SCHEMAS: Record<
  TerminalToolName,
  z.ZodObject<z.ZodRawShape>
> = {
  edit_skill: z.object({
    skillId: z.string().describe("The sId of the skill to modify"),
    instructionEdits: z
      .array(SkillInstructionEditArgSchema)
      .optional()
      .describe(
        "Block-targeted edits to the skill instructions. Each item targets one block by its data-block-id."
      ),
    toolEdits: z
      .array(
        z.object({
          action: z
            .enum(["add", "remove"])
            .describe("Whether to add or remove the tool"),
          toolId: z
            .string()
            .describe("The identifier of the tool to add or remove"),
        })
      )
      .optional()
      .describe("Tools to add or remove from the skill."),
    analysis: z
      .string()
      .optional()
      .describe("Why this change improves the skill"),
    title: z
      .string()
      .max(25)
      .optional()
      .describe(
        "A short, action-oriented user-facing title for this suggestion (MUST be at most 25 characters). " +
          "Only set this when producing final aggregated suggestions; leave unset for synthetic suggestions."
      ),
    sourceSuggestionIds: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "The sIds of the source suggestions consolidated into this suggestion."
      ),
  }),
  reject_suggestion: z.object({
    sourceSuggestionIds: z
      .array(z.string())
      .min(1)
      .describe(
        "The sIds of the source suggestions to reject. Must include at least one suggestion sId."
      ),
  }),
};

export interface TerminalToolCallEvent extends ToolCallEvent {
  content: ToolCallEvent["content"] & { name: TerminalToolName };
}

export interface ExploratoryToolCallInfo {
  id: string;
  name: ExploratoryToolName;
  arguments: Record<string, unknown>;
}

export interface TerminalToolCallInfo {
  id: string;
  name: TerminalToolName;
  arguments: Record<string, unknown>;
}

export type ReinforcedSkillsToolCallInfo =
  | ExploratoryToolCallInfo
  | TerminalToolCallInfo;

export interface TerminalToolCallSuccess {
  toolCall: TerminalToolCallInfo;
  message: string;
}

export interface TerminalToolCallFailure {
  toolCall: TerminalToolCallInfo;
  errorMessage: string;
}

export interface ProcessReinforcedSkillsEventsResult {
  suggestionsCreated: number;
  suggestionsRejected: number;
  approvedSourceSuggestionIds: string[];
  successfulToolCalls: TerminalToolCallSuccess[];
  failedToolCalls: TerminalToolCallFailure[];
}

export type ReinforcedSkillsOperationType =
  | "reinforcement_analyze_conversation"
  | "reinforcement_aggregate_suggestions";

export const REINFORCED_SKILLS_METADATA_KEYS = {
  reinforcedSkills: "reinforcedSkills",
  reinforcedOperationType: "reinforcedOperationType",
  reinforcedSkillIds: "reinforcedSkillIds",
} as const;

export function getReinforcedSkillsMetadata(
  reinforcedOperationType: ReinforcedSkillsOperationType,
  reinforcedSkillIds: string[]
) {
  return {
    [REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkills]: true,
    [REINFORCED_SKILLS_METADATA_KEYS.reinforcedOperationType]:
      reinforcedOperationType,
    [REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkillIds]: reinforcedSkillIds,
  };
}
