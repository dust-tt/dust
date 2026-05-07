import {
  COMPACTION_IN_PROGRESS_BLOCK_MESSAGE,
  FORCE_COMPACTION_BLOCK_MESSAGE,
  getCompactionBlockMessage,
  getInputBarBlockState,
} from "@app/components/assistant/conversation/input_bar/block_state";
import { describe, expect, it } from "vitest";

const FORCE_COMPACTION_THRESHOLD = 80;

describe("input bar block state", () => {
  it("blocks only submit while compaction is active", () => {
    const compactionBlockMessage = getCompactionBlockMessage({
      contextUsagePercentage: 0,
      forceCompactionThreshold: FORCE_COMPACTION_THRESHOLD,
      isCompactionInProgress: true,
    });

    expect(
      getInputBarBlockState({
        compactionBlockMessage,
        wakeUpBlockMessage: null,
      })
    ).toEqual({
      disableInput: false,
      submitBlockMessage: COMPACTION_IN_PROGRESS_BLOCK_MESSAGE,
    });
  });

  it("blocks only submit when forced compaction is required", () => {
    const compactionBlockMessage = getCompactionBlockMessage({
      contextUsagePercentage: FORCE_COMPACTION_THRESHOLD,
      forceCompactionThreshold: FORCE_COMPACTION_THRESHOLD,
      isCompactionInProgress: false,
    });

    expect(
      getInputBarBlockState({
        compactionBlockMessage,
        wakeUpBlockMessage: null,
      })
    ).toEqual({
      disableInput: false,
      submitBlockMessage: FORCE_COMPACTION_BLOCK_MESSAGE,
    });
  });

  it("fully disables input for non-owner wake-ups", () => {
    const wakeUpBlockMessage =
      "Conversation paused - a wake-up is scheduled tomorrow";

    expect(
      getInputBarBlockState({
        compactionBlockMessage: FORCE_COMPACTION_BLOCK_MESSAGE,
        wakeUpBlockMessage,
      })
    ).toEqual({
      disableInput: true,
      submitBlockMessage: wakeUpBlockMessage,
    });
  });
});
