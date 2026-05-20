import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { z } from "zod";

export const ORDERED_REASONING_EFFORTS = [
  "none",
  "light",
  "medium",
  "high",
] as const;

export const isReasoningEffort = (
  reasoningEffort: string
): reasoningEffort is ReasoningEffort =>
  ORDERED_REASONING_EFFORTS.includes(reasoningEffort as ReasoningEffort);

export const ReasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);
