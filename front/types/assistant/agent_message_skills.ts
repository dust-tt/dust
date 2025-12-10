export const AgentMessageSkillSources = [
  "agent_enabled",
  "conversation",
] as const;
export type AgentMessageSkillSource = (typeof AgentMessageSkillSources)[number];
