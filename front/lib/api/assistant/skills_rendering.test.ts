import { getEnabledSkillInstructions } from "@app/lib/api/assistant/skills_rendering";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { describe, expect, it } from "vitest";

type SkillInstructionsSource = Pick<SkillResource, "name" | "instructions"> & {
  extendedSkill: Pick<SkillResource, "instructions"> | null;
};

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

  it("strips skill icon attributes from model-facing skill instructions", () => {
    const skill = makeEnabledSkill({
      instructions:
        'Use <skill id="skill_123" name="Create memo" icon="book_open" />.',
    });

    expect(getEnabledSkillInstructions(skill)).toContain(
      '<skill id="skill_123" name="Create memo" />'
    );
    expect(getEnabledSkillInstructions(skill)).not.toContain(
      'icon="book_open"'
    );
  });
});
