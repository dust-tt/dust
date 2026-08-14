import { applyToolSourceLoadingPolicy } from "@app/lib/actions/tool_loading";
import { describe, expect, it } from "vitest";

describe("applyToolSourceLoadingPolicy", () => {
  it("clears eager metadata for a dynamically enabled skill tool", () => {
    expect(
      applyToolSourceLoadingPolicy(
        { name: "skill_tool", eager: true },
        { isFromSkillServer: true }
      )
    ).toEqual({ name: "skill_tool", eager: undefined });
  });

  it("preserves eager metadata for tools from other sources", () => {
    const tool = { name: "configured_tool", eager: true };

    expect(
      applyToolSourceLoadingPolicy(tool, { isFromSkillServer: false })
    ).toBe(tool);
  });
});
