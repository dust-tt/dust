import type { ToolCallEvent } from "@app/lib/api/llm/types/events";
import { z } from "zod";

export type ExploratoryToolName = "get_available_tools";

export type TerminalToolName = "edit_skill";

export const TERMINAL_TOOLS: TerminalToolName[] = ["edit_skill"];

export const EXPLORATORY_TOOLS: ExploratoryToolName[] = ["get_available_tools"];

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
  old_string: z
    .string()
    .min(1)
    .describe("Exact text to find in the current skill instructions."),
  new_string: z
    .string()
    .describe("Replacement text. Empty string deletes the matched span."),
  expected_occurrences: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "How many times old_string is expected to appear. Used to validate the edit is still applicable."
    ),
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
        "Sequential search-and-replace operations applied to the skill instructions."
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
