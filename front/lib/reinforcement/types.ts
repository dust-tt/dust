import type { ToolCallEvent } from "@app/lib/api/llm/types/events";
import { z } from "zod";

export type ExploratoryToolName = "get_available_tools";

export type TerminalToolName =
  | "suggest_skill_instruction_edits"
  | "suggest_skill_tools";

export const TERMINAL_TOOLS: TerminalToolName[] = [
  "suggest_skill_instruction_edits",
  "suggest_skill_tools",
];

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

export const TOOL_SCHEMAS: Record<
  TerminalToolName,
  z.ZodObject<z.ZodRawShape>
> = {
  suggest_skill_instruction_edits: z.object({
    suggestions: z.array(
      z.object({
        skillId: z.string(),
        instructions: z.string(),
        analysis: z.string(),
      })
    ),
  }),
  suggest_skill_tools: z.object({
    suggestions: z.array(
      z.object({
        skillId: z.string(),
        action: z.enum(["add", "remove"]),
        toolId: z.string(),
        analysis: z.string(),
      })
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
  successfulToolCalls: TerminalToolCallSuccess[];
  failedToolCalls: TerminalToolCallFailure[];
}

export type ReinforcedSkillsOperationType =
  | "reinforcement_analyze_conversation"
  | "reinforcement_aggregate_suggestions";

export const REINFORCED_SKILLS_METADATA_KEYS = {
  reinforcedSkills: "reinforcedSkills",
  reinforcedOperationType: "reinforcedOperationType",
  reinforcedSkillId: "reinforcedSkillId",
} as const;

export function getReinforcedSkillsMetadata(
  reinforcedOperationType: ReinforcedSkillsOperationType,
  reinforcedSkillId: string
) {
  return {
    [REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkills]: true,
    [REINFORCED_SKILLS_METADATA_KEYS.reinforcedOperationType]:
      reinforcedOperationType,
    [REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkillId]: reinforcedSkillId,
  };
}
