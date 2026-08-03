export const ASSISTANT_CREATIVITY_LEVELS = [
  "deterministic",
  "factual",
  "balanced",
  "creative",
] as const;
export type AssistantCreativityLevel =
  (typeof ASSISTANT_CREATIVITY_LEVELS)[number];
