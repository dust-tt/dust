export const AGENT_CREATIVITY_LEVEL_TEMPERATURES: Record<
  AgentCreativityLevel,
  number
> = {
  deterministic: 0.0,
  factual: 0.2,
  balanced: 0.7,
  creative: 1.0,
};

export const AGENT_CREATIVITY_LEVELS = [
  "deterministic",
  "factual",
  "balanced",
  "creative",
] as const;

export type AgentCreativityLevel = (typeof AGENT_CREATIVITY_LEVELS)[number];
