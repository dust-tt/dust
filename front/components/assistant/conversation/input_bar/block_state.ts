export const COMPACTION_IN_PROGRESS_BLOCK_MESSAGE =
  "Wait for compaction to finish.";
export const FORCE_COMPACTION_BLOCK_MESSAGE =
  "Context is full, compact to continue.";

export function getCompactionBlockMessage({
  contextUsagePercentage,
  forceCompactionThreshold,
  isCompactionInProgress,
}: {
  contextUsagePercentage: number;
  forceCompactionThreshold: number;
  isCompactionInProgress: boolean;
}): string | null {
  if (isCompactionInProgress) {
    return COMPACTION_IN_PROGRESS_BLOCK_MESSAGE;
  }

  if (contextUsagePercentage >= forceCompactionThreshold) {
    return FORCE_COMPACTION_BLOCK_MESSAGE;
  }

  return null;
}

export function getInputBarBlockState({
  compactionBlockMessage,
  wakeUpBlockMessage,
}: {
  compactionBlockMessage: string | null;
  wakeUpBlockMessage: string | null;
}): {
  disableInput: boolean;
  submitBlockMessage: string | null;
} {
  return {
    disableInput: wakeUpBlockMessage !== null,
    submitBlockMessage: wakeUpBlockMessage ?? compactionBlockMessage,
  };
}
