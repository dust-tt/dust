import { AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import type { ToolCallEvent } from "@app/lib/api/llm/types/events";
import { z } from "zod";

export const MAX_REINFORCED_ANALYSIS_STEPS = 4;

export type ExploratoryToolName =
  | "get_available_skills"
  | "get_available_tools";

export type TerminalToolName =
  | "suggest_prompt_edits"
  | "suggest_tools"
  | "suggest_skills";

export const TERMINAL_TOOLS: TerminalToolName[] = [
  "suggest_prompt_edits",
  "suggest_tools",
  "suggest_skills",
];

export const EXPLORATORY_TOOLS: ExploratoryToolName[] = [
  "get_available_skills",
  "get_available_tools",
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

export const TOOL_SCHEMAS: Record<
  TerminalToolName,
  z.ZodObject<z.ZodRawShape>
> = {
  suggest_prompt_edits: z.object(
    AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA.suggest_prompt_edits.schema
  ),
  suggest_tools: z.object(
    AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA.suggest_tools.schema
  ),
  suggest_skills: z.object(
    AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA.suggest_skills.schema
  ),
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

export type ReinforcedToolCallInfo =
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

export interface ProcessReinforcedEventsResult {
  suggestionsCreated: number;
  successfulToolCalls: TerminalToolCallSuccess[];
  failedToolCalls: TerminalToolCallFailure[];
}

export type ReinforcedOperationType =
  | "reinforced_agent_analyze_conversation"
  | "reinforced_agent_aggregate_suggestions";

export const REINFORCEMENT_METADATA_KEYS = {
  reinforcedAgent: "reinforcedAgent",
  reinforcedOperationType: "reinforcedOperationType",
  reinforcedAgentConfigurationId: "reinforcedAgentConfigurationId",
} as const;

export function getReinforcementMetadata(
  reinforcedOperationType: ReinforcedOperationType,
  reinforcedAgentConfigurationId: string
) {
  return {
    [REINFORCEMENT_METADATA_KEYS.reinforcedAgent]: true,
    [REINFORCEMENT_METADATA_KEYS.reinforcedOperationType]:
      reinforcedOperationType,
    [REINFORCEMENT_METADATA_KEYS.reinforcedAgentConfigurationId]:
      reinforcedAgentConfigurationId,
  };
}
