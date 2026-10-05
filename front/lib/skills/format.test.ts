import { describe, expect, it } from "vitest";

import {
  extractSkillRefs,
  hasUnparsableSkillRefTag,
  parseSkillTag,
  renameSkillReferencesInContent,
  resolveSkillRefTags,
  SKILL_REFERENCE_TAG_REGEX,
  SKILL_TAG_REGEX,
  serializeSkillTag,
} from "./format";

describe("renameSkillReferencesInContent", () => {
  it("preserves dollar replacement tokens in renamed skill names", () => {
    const content =
      'before <skill id="ski_target" name="Old name" /> middle <skill id="ski_other" name="Other" /> after';
    const newName = "Cost $1 $& $$ $` $'";

    expect(
      renameSkillReferencesInContent(content, {
        skillId: "ski_target",
        newName,
      })
    ).toEqual(
      'before <skill id="ski_target" name="Cost $1 $&amp; $$ $` $\'" /> middle <skill id="ski_other" name="Other" /> after'
    );
  });
});

describe("skill tag names", () => {
  it("escapes the name on write and decodes it on read", () => {
    const skill = {
      id: "ski_A",
      name: 'Meeting "Notes" <v2> & more',
      icon: null,
    };
    const tag = serializeSkillTag(skill);

    expect(tag).toEqual(
      '<skill id="ski_A" name="Meeting &quot;Notes&quot; &lt;v2&gt; &amp; more" />'
    );
    expect(parseSkillTag(tag)?.name).toEqual(skill.name);
  });

  it("still parses a legacy tag holding an unescaped quote", () => {
    expect(
      parseSkillTag('<skill id="ski_A" name="Meeting "Notes"" />')
    ).toMatchObject({ id: "ski_A", name: "Meeting " });
  });

  it("parses a tag whose separator is more than one space", () => {
    expect(parseSkillTag('<skill  id="ski_A" name="Notes" />')).toMatchObject({
      id: "ski_A",
      name: "Notes",
    });
  });

  it("does not match a raw < inside an attribute", () => {
    expect([
      ...'<skill id="ski_A" name="a<b" />'.matchAll(SKILL_TAG_REGEX),
    ]).toEqual([]);
  });
});

describe("skill tag regex backtracking", () => {
  const repeatedMalformedOpenings = "<skill ".repeat(16_000);

  it("rejects repeated malformed openings without rescanning the input", () => {
    for (const pattern of [SKILL_TAG_REGEX, SKILL_REFERENCE_TAG_REGEX]) {
      const startedAt = performance.now();
      const matches = [...repeatedMalformedOpenings.matchAll(pattern)];

      expect(performance.now() - startedAt).toBeLessThan(50);
      expect(matches).toEqual([]);
    }
  });

  it("still matches a valid tag after a malformed opening", () => {
    const content = '<skill <skill id="ski_A" name="Notes" />';

    expect(
      [...content.matchAll(SKILL_TAG_REGEX)].map((match) => match[0])
    ).toEqual(['<skill id="ski_A" name="Notes" />']);
    expect(
      [...content.matchAll(SKILL_REFERENCE_TAG_REGEX)].map((match) => match[0])
    ).toEqual(['<skill id="ski_A" name="Notes" />']);
  });
});

describe("skill ref tags", () => {
  const content =
    '<p>Use <skill ref="notes"/> then <skill ref=\'summary\' name="Old"></skill> and <skill ref="notes" /></p>';

  it("extracts each ref once, whatever the quotes, attributes or closing form", () => {
    expect(extractSkillRefs(content)).toEqual(["notes", "summary"]);
  });

  it("rewrites ref tags into real skill tags and leaves unknown refs untouched", () => {
    const refs = new Map([
      ["notes", { id: "skl_A", name: "Meeting Notes", icon: null }],
    ]);

    expect(resolveSkillRefTags(content, refs)).toEqual(
      '<p>Use <skill id="skl_A" name="Meeting Notes"></skill> then <skill ref=\'summary\' name="Old"></skill> and <skill id="skl_A" name="Meeting Notes"></skill></p>'
    );
  });

  it("flags skill tags whose ref cannot be parsed", () => {
    expect(hasUnparsableSkillRefTag(content)).toBe(false);
    expect(hasUnparsableSkillRefTag('<skill ref="bad ref"/>')).toBe(true);
    expect(hasUnparsableSkillRefTag("<skill ref=notes/>")).toBe(true);
    expect(hasUnparsableSkillRefTag('<skill ref = "notes"/>')).toBe(true);
    expect(hasUnparsableSkillRefTag('<skill ref="notes">\n</skill>')).toBe(
      true
    );
  });
});
