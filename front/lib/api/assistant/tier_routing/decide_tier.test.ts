import { chooseRoutedStream } from "@app/lib/api/assistant/tier_routing/decide_tier";
import type { DecisionScoreAnswer } from "@app/lib/model_constructors/types/output/decisions";
import { describe, expect, it } from "vitest";

function scoreAnswer(probabilities: number[]): DecisionScoreAnswer {
  return {
    type: "score",
    name: "minimum_tier",
    score: 0,
    confidence: 0,
    probabilities: probabilities.map((probability, value) => ({
      label: `level_${value}`,
      value,
      probability,
    })),
  };
}

describe("chooseRoutedStream", () => {
  it("routes a standard agent to basic when basic alone reaches the threshold", () => {
    expect(chooseRoutedStream(scoreAnswer([0.85, 0.15]), "auto")).toBe(
      "auto_fast"
    );
  });

  it("keeps a standard agent on standard when basic falls short", () => {
    expect(chooseRoutedStream(scoreAnswer([0.71, 0.29]), "auto")).toBe("auto");
  });

  it("routes a premium agent to standard on the cumulative probability", () => {
    expect(
      chooseRoutedStream(scoreAnswer([0.5, 0.35, 0.15]), "auto_complex")
    ).toBe("auto");
  });

  it("keeps a premium agent on premium when no lower tier reaches the threshold", () => {
    expect(
      chooseRoutedStream(scoreAnswer([0.3, 0.3, 0.4]), "auto_complex")
    ).toBe("auto_complex");
  });

  it("falls back to the configured stream when the answer has no probabilities", () => {
    expect(chooseRoutedStream(scoreAnswer([]), "auto_complex")).toBe(
      "auto_complex"
    );
  });
});
