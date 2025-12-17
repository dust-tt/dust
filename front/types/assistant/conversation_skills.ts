export const ConversationSkillOrigins = [
  "agent_enabled",
  "conversation",
] as const;
export type ConversationSkillOrigin = (typeof ConversationSkillOrigins)[number];
