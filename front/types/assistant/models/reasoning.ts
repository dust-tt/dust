import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { ioTsEnum } from "@app/types/shared/utils/iots_utils";

export const REASONING_EFFORTS = ["none", "light", "medium", "high"] as const;

export const isReasoningEffort = (
  reasoningEffort: string
): reasoningEffort is ReasoningEffort =>
  REASONING_EFFORTS.includes(reasoningEffort as ReasoningEffort);

export const ReasoningEffortCodec =
  ioTsEnum<(typeof REASONING_EFFORTS)[number]>(REASONING_EFFORTS);
