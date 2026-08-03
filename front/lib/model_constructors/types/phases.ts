export const PHASES = ["commentary", "final_answer"] as const;
export type Phase = (typeof PHASES)[number];
