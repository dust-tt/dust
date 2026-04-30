import {
  parseSkillReferences,
  replaceSkillReferenceName,
  serializeSkillReference,
} from "@app/lib/skill_references";
import { describe, expect, it } from "vitest";

describe("skill reference serialization", () => {
  it("parses unique serialized skill references", () => {
    const serialized =
      'Use <skill name="Research" id="skill_123" /> then <skill id="skill_456" name="Write" /> and <skill name="Research" id="skill_123" />.';

    expect(parseSkillReferences(serialized)).toEqual([
      { name: "Research", skillId: "skill_123" },
      { name: "Write", skillId: "skill_456" },
    ]);
  });

  it("serializes and parses escaped skill names", () => {
    const serialized = serializeSkillReference({
      name: "R&D",
      skillId: "skill_123",
    });

    expect(serialized).toBe('<skill name="R&amp;D" id="skill_123" />');
    expect(parseSkillReferences(serialized)).toEqual([
      { name: "R&D", skillId: "skill_123" },
    ]);
  });

  it("replaces a referenced skill name by id", () => {
    const instructions =
      'Use <skill name="Old" id="skill_123" /> and <skill name="Other" id="skill_456" />.';

    expect(
      replaceSkillReferenceName(instructions, {
        skillId: "skill_123",
        name: "New",
      }),
    ).toBe(
      'Use <skill name="New" id="skill_123" /> and <skill name="Other" id="skill_456" />.',
    );
  });
});
