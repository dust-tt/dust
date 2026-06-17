import { describe, expect, it } from "vitest";

import {
  getSlackAutoReadPatternValidationError,
  SlackAutoReadPatternsSchema,
} from "@connectors/types";

import { findMatchingChannelPatterns } from "./auto_read_channel";

describe("Slack auto-read channel patterns", () => {
  it("matches safe regex patterns", () => {
    const patterns = [
      { pattern: "team-.*", spaceId: "space-team" },
      { pattern: "(eng|support)-alerts", spaceId: "space-alerts" },
    ];

    expect(findMatchingChannelPatterns("team-security", patterns)).toEqual([
      patterns[0],
    ]);
    expect(findMatchingChannelPatterns("eng-alerts", patterns)).toEqual([
      patterns[1],
    ]);
  });

  it("rejects invalid patterns at configuration validation time", () => {
    const result = SlackAutoReadPatternsSchema.safeParse([
      { pattern: "[", spaceId: "space" },
    ]);

    expect(result.success).toBe(false);
  });

  it("rejects ReDoS-prone nested quantifiers", () => {
    expect(getSlackAutoReadPatternValidationError("(a+)+b")).toBeTruthy();
    expect(getSlackAutoReadPatternValidationError("(.+)+")).toBeTruthy();
    expect(
      SlackAutoReadPatternsSchema.safeParse([
        { pattern: "(a+)+b", spaceId: "space" },
      ]).success
    ).toBe(false);
  });

  it("rejects quantified alternation groups", () => {
    expect(getSlackAutoReadPatternValidationError("(a|aa)+b")).toBeTruthy();
    expect(getSlackAutoReadPatternValidationError("(?:foo|bar)*")).toBeTruthy();
  });

  it("rejects backreferences and lookarounds", () => {
    expect(getSlackAutoReadPatternValidationError("(a)\\1")).toBeTruthy();
    expect(getSlackAutoReadPatternValidationError("foo(?=bar)")).toBeTruthy();
  });

  it("does not compile unsafe legacy stored patterns while matching", () => {
    const patterns = [
      { pattern: "(a+)+b", spaceId: "space-redos" },
      { pattern: "safe-.*", spaceId: "space-safe" },
    ];

    expect(findMatchingChannelPatterns("safe-channel", patterns)).toEqual([
      patterns[1],
    ]);
  });
});
