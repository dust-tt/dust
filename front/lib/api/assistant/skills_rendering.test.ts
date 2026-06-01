import {
  getEnabledSkillInstructions,
  resolveSkillInstructions,
} from "@app/lib/api/assistant/skills_rendering";
import {
  INTERACTIVE_CONTENT_INSTRUCTIONS,
  INTERACTIVE_CONTENT_INSTRUCTIONS_OPENAI_V1,
} from "@app/lib/api/actions/servers/interactive_content/instructions";
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

  it("uses default frame instructions without a frames variant", () => {
    expect(
      resolveSkillInstructions({
        skill: {
          sId: "frames",
          instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
        },
      })
    ).toBe(INTERACTIVE_CONTENT_INSTRUCTIONS);
  });

  it("uses OpenAI frame instructions when the agent has the OpenAI frames variant", () => {
    expect(
      resolveSkillInstructions({
        agentConfiguration: { framesVariant: "openai-v1" },
        skill: {
          sId: "frames",
          instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
        },
      })
    ).toBe(INTERACTIVE_CONTENT_INSTRUCTIONS_OPENAI_V1);
  });

  it("renders enabled frame skill messages with the OpenAI variant", () => {
    const skill = makeEnabledSkill({
      sId: "frames",
      name: "Create Frames",
      instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
    });

    const instructions = getEnabledSkillInstructions(skill, {
      agentConfiguration: { framesVariant: "openai-v1" },
    });

    expect(instructions).toContain(
      "### Frame Authoring Rules for OpenAI Models"
    );
    expect(instructions).toContain("### Creating Files");
  });

  it("does not change non-frame skill instructions for a frames variant agent", () => {
    expect(
      resolveSkillInstructions({
        agentConfiguration: { framesVariant: "openai-v1" },
        skill: {
          sId: "research",
          instructions: "Use the research process.",
        },
      })
    ).toBe("Use the research process.");
  });
});
