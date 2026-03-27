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
