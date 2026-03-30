export const MAX_REINFORCED_ANALYSIS_STEPS = 4;

export type ExploratoryToolName =
  | "get_available_skills"
  | "get_available_tools";

export type TerminalToolName =
  | "suggest_prompt_edits"
  | "suggest_tools"
  | "suggest_skills";

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
