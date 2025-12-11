export const ConversationSkillSources = [
  "agent_enabled",
  "conversation",
] as const;
export type ConversationSkillSource = (typeof ConversationSkillSources)[number];
