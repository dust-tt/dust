export const ORDERED_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "maximal",
] as const;
export type ReasoningEffort = (typeof ORDERED_REASONING_EFFORTS)[number];
