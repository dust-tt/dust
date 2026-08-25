import { getDeepDiveInstructions } from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import { describe, expect, it } from "vitest";

describe("getDeepDiveInstructions", () => {
  it("classifies work by research shape instead of tool count", () => {
    const instructions = getDeepDiveInstructions({
      includeToolsetsPrompt: false,
    });

    expect(instructions).toContain(
      "it requires a routine SQL analysis against known tables"
    );
    expect(instructions).toContain(
      "Task length alone does not make a request complex"
    );
    expect(instructions).toContain(
      "If the work remains linear and manageable, treat it as simple"
    );
    expect(instructions).not.toContain("it requires running SQL queries");
    expect(instructions).not.toContain("requires 3+ steps of tool uses");
    expect(instructions).not.toContain("browsing 3+ web pages");
  });
});
