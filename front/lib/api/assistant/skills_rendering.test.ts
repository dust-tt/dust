import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/api/actions/servers/interactive_content/instructions";
import { getEnabledSkillInstructions } from "@app/lib/api/assistant/skills_rendering";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { describe, expect, it } from "vitest";

type SkillInstructionsSource = Pick<
  SkillResource,
  "sId" | "name" | "instructions"
>;

function makeEnabledSkill(
  overrides: Partial<SkillInstructionsSource>
): SkillInstructionsSource {
  return {
    sId: "research",
    name: "ResearchSkill",
    instructions: "",
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

  it("renders enabled frame skill messages with v2 authoring prose", () => {
    const skill = makeEnabledSkill({
      sId: "frames",
      name: "Create Frames",
      instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
    });

    const instructions = getEnabledSkillInstructions(skill);

    expect(instructions).toContain("### Rendering Context");
    expect(instructions).toContain("### Creating Files");
  });

  it("frame instructions do not contain v1-only markers", () => {
    // Guards against re-importing the legacy viz authoring prose (still used
    // by other servers) into the frames instructions.
    expect(INTERACTIVE_CONTENT_INSTRUCTIONS).not.toContain(
      "Premium, Minimalist Aesthetic"
    );
  });
});
