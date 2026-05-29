import { getEnabledSkillInstructions } from "@app/lib/api/assistant/skills_rendering";
import { describe, expect, it } from "vitest";

type SkillInstructionsSource = Parameters<
  typeof getEnabledSkillInstructions
>[0];

function makeEnabledSkill(
  overrides: Partial<SkillInstructionsSource>
): SkillInstructionsSource {
  return {
    name: "ResearchSkill",
    instructions: "",
    extendedSkill: null,
    ...overrides,
  };
}

describe("getEnabledSkillInstructions", () => {
  it("strips tool icon attributes from model-facing skill instructions", () => {
    const skill = makeEnabledSkill({
      instructions:
        'Use <tool id="mcp_server_view_1" name="GitHub Search" icon="GithubLogo" />.',
    });

    expect(getEnabledSkillInstructions(skill)).toContain(
      '<tool id="mcp_server_view_1" name="GitHub Search" />'
    );
    expect(getEnabledSkillInstructions(skill)).not.toContain(
      'icon="GithubLogo"'
    );
  });
});
