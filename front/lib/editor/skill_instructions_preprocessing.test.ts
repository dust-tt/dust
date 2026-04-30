import {
  postProcessMarkdown,
  preprocessMarkdownForEditor,
} from "@app/lib/editor/skill_instructions_preprocessing";
import {
  parseSkillReferences,
  serializeSkillReference,
} from "@app/lib/skill_references";
import { describe, expect, it } from "vitest";

describe("skill instructions preprocessing", () => {
  it("preserves skill reference attributes while post-processing markdown", () => {
    const serialized = serializeSkillReference({
      name: 'R&D "Ops"',
      skillId: "skill_123",
    });

    const processed = postProcessMarkdown(serialized);

    expect(processed).toBe(
      '<skill name="R&amp;D &quot;Ops&quot;" id="skill_123" />',
    );
    expect(parseSkillReferences(processed)).toEqual([
      {
        name: 'R&D "Ops"',
        skillId: "skill_123",
      },
    ]);
  });

  it("preserves skill tags while escaping other XML-like tags for the editor", () => {
    expect(
      preprocessMarkdownForEditor(
        'Use <skill name="Research" id="skill_123" /> then <internal>.',
      ),
    ).toBe(
      'Use <skill name="Research" id="skill_123" /> then <\u200Binternal>.',
    );
  });
});
