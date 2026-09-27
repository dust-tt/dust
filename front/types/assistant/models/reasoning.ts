import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { z } from "zod";

// The router's efforts, plus the legacy "light" that stored configurations still use until they are
// migrated to the router vocabulary. "light" sits where it ran: between "minimal" and "low".
export const ORDERED_REASONING_EFFORTS = [
  "none",
  "minimal",
  "light",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

export const isReasoningEffort = (
  reasoningEffort: string
): reasoningEffort is ReasoningEffort =>
  ORDERED_REASONING_EFFORTS.includes(reasoningEffort as ReasoningEffort);

export const ReasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);
