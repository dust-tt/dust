import {
  filterRaisingReasoningEfforts,
  supportsPerMessageReasoningEffort,
} from "@app/lib/api/llm/per_message_reasoning_effort";
import {
  CLAUDE_HAIKU_5_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { GPT_5_5_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

// A conversation item: an effort change when `effort` is set, any other message otherwise.
type Item = { effort: ReasoningEffort | null };

function keptEfforts(
  model: ModelConfigurationType,
  effort: ReasoningEffort | null,
  items: Item[]
): (ReasoningEffort | null)[] {
  return filterRaisingReasoningEfforts(model, items, {
    effort,
    getEffort: (item) => item.effort,
  }).map((item) => item.effort);
}

describe("supportsPerMessageReasoningEffort", () => {
  it("is on by default for Anthropic models", () => {
    expect(
      supportsPerMessageReasoningEffort(CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG)
    ).toBe(true);
    expect(
      supportsPerMessageReasoningEffort(CLAUDE_HAIKU_5_5_DEFAULT_MODEL_CONFIG)
    ).toBe(true);
  });

  it("is off for opted-out and non-Anthropic models", () => {
    expect(
      supportsPerMessageReasoningEffort(CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG)
    ).toBe(false);
    expect(supportsPerMessageReasoningEffort(GPT_5_5_MODEL_CONFIG)).toBe(false);
  });
});

describe("filterRaisingReasoningEfforts", () => {
  it("keeps the effort changes that raise the effort in effect", () => {
    expect(
      keptEfforts(CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG, "medium", [
        { effort: null },
        { effort: "high" },
        { effort: null },
        { effort: "xhigh" },
      ])
    ).toEqual([null, "high", null, "xhigh"]);
  });

  it("drops changes that lower or keep the effort in effect", () => {
    expect(
      keptEfforts(CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG, "medium", [
        { effort: "low" },
        { effort: "medium" },
        { effort: "xhigh" },
        { effort: "high" },
      ])
    ).toEqual(["xhigh"]);
  });

  it("drops all changes on models without per-message effort", () => {
    expect(
      keptEfforts(CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG, "medium", [
        { effort: null },
        { effort: "high" },
      ])
    ).toEqual([null]);
    expect(
      keptEfforts(GPT_5_5_MODEL_CONFIG, "medium", [
        { effort: null },
        { effort: "high" },
      ])
    ).toEqual([null]);
  });

  it("drops all changes when thinking is disabled or the effort is unknown", () => {
    // Effort "none" disables thinking: a per-message effort can 400 there.
    expect(
      keptEfforts(CLAUDE_HAIKU_5_5_DEFAULT_MODEL_CONFIG, "none", [
        { effort: "low" },
        { effort: "high" },
      ])
    ).toEqual([]);
    expect(
      keptEfforts(CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG, null, [
        { effort: "high" },
      ])
    ).toEqual([]);
  });
});
