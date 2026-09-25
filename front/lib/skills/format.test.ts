import { describe, expect, it } from "vitest";

import {
  extractSkillRefs,
  hasUnparsableSkillRefTag,
  renameSkillReferencesInContent,
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
      `before <skill id="ski_target" name="${newName}" /> middle <skill id="ski_other" name="Other" /> after`
    );
  });
});

describe("skill ref tags", () => {
  const content =
    '<p>Use <skill ref="notes"/> then <skill ref=\'summary\' name="Old"></skill> and <skill ref="notes" /></p>';

  it("extracts each ref once, whatever the quotes, attributes or closing form", () => {
    expect(extractSkillRefs(content)).toEqual(["notes", "summary"]);
  });

  it("flags skill tags whose ref cannot be parsed", () => {
    expect(hasUnparsableSkillRefTag(content)).toBe(false);
    expect(hasUnparsableSkillRefTag('<skill ref="bad ref"/>')).toBe(true);
    expect(hasUnparsableSkillRefTag("<skill ref=notes/>")).toBe(true);
    expect(hasUnparsableSkillRefTag('<skill ref = "notes"/>')).toBe(true);
  });
});
