import type { ReasoningEffortIdType } from "@app/types/assistant/models/types";
import { ioTsEnum } from "@app/types/shared/utils/iots_utils";

export const REASONING_EFFORT_IDS = [
  "none",
  "light",
  "medium",
  "high",
] as const;

export const isReasoningEffortId = (
  reasoningEffortId: string
): reasoningEffortId is ReasoningEffortIdType =>
  REASONING_EFFORT_IDS.includes(reasoningEffortId as ReasoningEffortIdType);

export const ReasoningEffortCodec =
  ioTsEnum<(typeof REASONING_EFFORT_IDS)[number]>(REASONING_EFFORT_IDS);
