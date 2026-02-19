import {
  ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING,
  ANTHROPIC_THINKING_EFFORT_MAPPING,
  toAutoThinkingConfig,
  toThinkingConfig,
} from "@app/lib/api/llm/clients/anthropic/utils";
import { describe, expect, it } from "vitest";

describe("toThinkingConfig", () => {
  it("returns undefined thinking when reasoning effort is null", () => {
    expect(toThinkingConfig(null)).toEqual({ thinking: undefined });
  });

  it('returns disabled thinking when reasoning effort is "none"', () => {
    expect(toThinkingConfig("none")).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it('returns disabled thinking for "light" when native light reasoning is false', () => {
    expect(toThinkingConfig("light", false)).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it('returns enabled thinking for "light" when native light reasoning is true', () => {
    expect(toThinkingConfig("light", true)).toEqual({
      thinking: {
        type: "enabled",
        budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING.light,
      },
    });
  });

  it('returns enabled thinking with configured budget tokens for "medium"', () => {
    expect(toThinkingConfig("medium")).toEqual({
      thinking: {
        type: "enabled",
        budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING.medium,
      },
    });
  });

  it('returns enabled thinking with configured budget tokens for "high"', () => {
    expect(toThinkingConfig("high")).toEqual({
      thinking: {
        type: "enabled",
        budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING.high,
      },
    });
  });

  it('ignores useNativeLightReasoning parameter for reasoning efforts other than "light"', () => {
    expect(toThinkingConfig("medium", false)).toEqual({
      thinking: {
        type: "enabled",
        budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING.medium,
      },
    });
    expect(toThinkingConfig("high", true)).toEqual({
      thinking: {
        type: "enabled",
        budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS_MAPPING.high,
      },
    });
  });
});

describe("toAutoThinkingConfig", () => {
  it("returns adaptive thinking when reasoning effort is null", () => {
    expect(toAutoThinkingConfig(null)).toEqual({
      thinking: { type: "adaptive" },
    });
  });

  it('returns disabled thinking when reasoning effort is "none"', () => {
    expect(toAutoThinkingConfig("none")).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it('returns disabled thinking for "light" when native light reasoning is false', () => {
    expect(toAutoThinkingConfig("light")).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it('returns adaptive thinking with output_config for "medium"', () => {
    expect(toAutoThinkingConfig("medium")).toEqual({
      thinking: { type: "adaptive" },
      output_config: {
        effort: ANTHROPIC_THINKING_EFFORT_MAPPING.medium,
      },
    });
  });

  it('returns adaptive thinking with output_config for "high"', () => {
    expect(toAutoThinkingConfig("high")).toEqual({
      thinking: { type: "adaptive" },
      output_config: {
        effort: ANTHROPIC_THINKING_EFFORT_MAPPING.high,
      },
    });
  });
});
