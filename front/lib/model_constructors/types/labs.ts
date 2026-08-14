export const OPENAI_LAB = "openai" as const;
export const ANTHROPIC_LAB = "anthropic" as const;
export const GOOGLE_LAB = "google" as const;
export const MISTRAL_LAB = "mistral" as const;
export const DEEPSEEK_LAB = "deepseek" as const;
export const FIREWORKS_LAB = "fireworks" as const;
export const MOONSHOT_AI_LAB = "moonshot_ai" as const;
export const Z_AI_LAB = "z_ai" as const;
export const THINKING_MACHINES_LAB = "thinking_machines" as const;
export const XAI_LAB = "xai" as const;
export const NOOP_LAB = "noop" as const;

export const LABS = [
  OPENAI_LAB,
  ANTHROPIC_LAB,
  GOOGLE_LAB,
  MISTRAL_LAB,
  DEEPSEEK_LAB,
  MOONSHOT_AI_LAB,
  Z_AI_LAB,
  THINKING_MACHINES_LAB,
  XAI_LAB,
  NOOP_LAB,
] as const;
export type Lab = (typeof LABS)[number];

export function isLab(value: string): value is Lab {
  return (LABS as readonly string[]).includes(value);
}
