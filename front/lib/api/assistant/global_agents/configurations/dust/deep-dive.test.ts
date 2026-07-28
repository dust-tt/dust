import { getDeepDiveInstructions } from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import { describe, expect, it } from "vitest";

describe("getDeepDiveInstructions", () => {
  it("keeps all Frame operations on the primary agent", () => {
    const instructions = getDeepDiveInstructions({
      includeToolsetsPrompt: true,
      hasSandbox: true,
    });

    expect(instructions).toContain(
      "Never delegate creating, updating, publishing, or sharing a Frame (Interactive Content) to a sub-agent."
    );
    expect(instructions).toContain(
      "the primary agent must enable the Create Frames skill, perform every Frame operation itself, and return the working Frame or share link to the user."
    );
  });
});
