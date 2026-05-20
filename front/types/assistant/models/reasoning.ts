import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { ioTsEnum } from "@app/types/shared/utils/iots_utils";
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

export const ReasoningEffortCodec = ioTsEnum<
  (typeof ORDERED_REASONING_EFFORTS)[number]
>(ORDERED_REASONING_EFFORTS);
export const ReasoningEffortSchema = z.enum(ORDERED_REASONING_EFFORTS);
