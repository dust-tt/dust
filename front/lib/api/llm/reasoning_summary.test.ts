import { withConciseOpenAIReasoningSummary } from "@app/lib/api/llm/reasoning_summary";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { describe, expect, it } from "vitest";

const CONFIG: InputConfig = { reasoning: { effort: "medium" } };

describe("withConciseOpenAIReasoningSummary", () => {
  it("keeps concise summaries disabled by default", () => {
    expect(withConciseOpenAIReasoningSummary(CONFIG, [])).toEqual(CONFIG);
  });

  it("enables concise summaries for flagged workspaces", () => {
    expect(
      withConciseOpenAIReasoningSummary(CONFIG, [
        "openai_concise_reasoning_summaries",
      ])
    ).toEqual({
      ...CONFIG,
      conciseReasoningSummary: true,
    });
  });
});
