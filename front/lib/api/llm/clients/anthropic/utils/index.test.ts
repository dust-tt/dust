import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING,
  toThinkingConfig,
} from "@app/lib/api/llm/clients/anthropic/utils";

describe("toThinkingConfig", () => {
  it('returns undefined for "light" when native light reasoning is false', () => {
    expect(toThinkingConfig("light", false)).toEqual({ type: "disabled" });
  });

  it('returns configured budget tokens for "medium"', () => {
    expect(toThinkingConfig("medium")).toEqual({
      type: "enabled",
      budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING.medium,
    });
  });
});
