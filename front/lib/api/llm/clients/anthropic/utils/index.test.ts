import { describe, expect, it } from "vitest";

import {
  CLAUDE_4_THINKING_BUDGET_TOKENS,
  toThinkingConfig,
} from "@app/lib/api/llm/clients/anthropic/utils";

describe("toThinkingConfig", () => {
  it('returns undefined for "light" when native light reasoning is false', () => {
    expect(toThinkingConfig("light", false)).toBeUndefined();
  });

  it('returns configured budget tokens for "medium"', () => {
    expect(toThinkingConfig("medium")).toEqual({
      type: "enabled",
      budget_tokens: CLAUDE_4_THINKING_BUDGET_TOKENS.medium,
    });
  });
});
