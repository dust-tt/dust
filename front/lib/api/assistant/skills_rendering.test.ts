import {
  INTERACTIVE_CONTENT_INSTRUCTIONS,
  INTERACTIVE_CONTENT_INSTRUCTIONS_V2,
} from "@app/lib/api/actions/servers/interactive_content/instructions";
import {
  getEnabledSkillInstructions,
  resolveSkillInstructions,
} from "@app/lib/api/assistant/skills_rendering";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { describe, expect, it } from "vitest";

type SkillInstructionsSource = Pick<
  SkillResource,
  "sId" | "name" | "instructions"
> & {
  extendedSkill: Pick<SkillResource, "sId" | "instructions"> | null;
};

function makeEnabledSkill(
  overrides: Partial<SkillInstructionsSource>
): SkillInstructionsSource {
  return {
    sId: "research",
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

  it("uses default frame instructions when the v2 flag is off", () => {
    expect(
      resolveSkillInstructions({
        skill: {
          sId: "frames",
          instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
        },
        useFramesV2: false,
      })
    ).toBe(INTERACTIVE_CONTENT_INSTRUCTIONS);
  });

  it("uses v2 frame instructions when the v2 flag is on", () => {
    expect(
      resolveSkillInstructions({
        skill: {
          sId: "frames",
          instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
        },
        useFramesV2: true,
      })
    ).toBe(INTERACTIVE_CONTENT_INSTRUCTIONS_V2);
  });

  it("renders enabled frame skill messages with v2 authoring prose", () => {
    const skill = makeEnabledSkill({
      sId: "frames",
      name: "Create Frames",
      instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
    });

    const instructions = getEnabledSkillInstructions(skill, {
      useFramesV2: true,
    });

    expect(instructions).toContain("### Rendering Context");
    expect(instructions).toContain("### Creating Files");
  });

  it("v2 frame instructions do not contain v1-only markers", () => {
    // Guards against regressions where v1 prose chunks leak into v2 (e.g. a
    // missed `.replace()` target, or a stale import).
    expect(INTERACTIVE_CONTENT_INSTRUCTIONS_V2).not.toContain(
      "### Frame Authoring Rules"
    );
    expect(INTERACTIVE_CONTENT_INSTRUCTIONS_V2).not.toContain(
      "Premium, Minimalist Aesthetic"
    );
  });

  it("does not change non-frame skill instructions when the v2 flag is on", () => {
    expect(
      resolveSkillInstructions({
        skill: {
          sId: "research",
          instructions: "Use the research process.",
        },
        useFramesV2: true,
      })
    ).toBe("Use the research process.");
  });
});
