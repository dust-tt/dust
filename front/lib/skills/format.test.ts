import { describe, expect, it } from "vitest";

import {
  renameSkillReferencesInContent,
  replaceSkillReferencesWithUnavailableInContent,
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

describe("replaceSkillReferencesWithUnavailableInContent", () => {
  it("replaces markdown skill references with unavailable skill tags", () => {
    const content =
      'before <skill id="ski_target" name="Target" /> middle <skill id="ski_other" name="Other" /> after';

    expect(
      replaceSkillReferencesWithUnavailableInContent(content, {
        skillId: "ski_target",
      })
    ).toEqual(
      'before <unavailable_skill id="ski_target" /> middle <skill id="ski_other" name="Other" /> after'
    );
  });

  it("replaces HTML skill references with unavailable skill tags", () => {
    const content =
      'before <skill id="ski_target" name="Target"></skill> middle <skill id="ski_other" name="Other"></skill> after';

    expect(
      replaceSkillReferencesWithUnavailableInContent(content, {
        skillId: "ski_target",
      })
    ).toEqual(
      'before <unavailable_skill id="ski_target"></unavailable_skill> middle <skill id="ski_other" name="Other"></skill> after'
    );
  });
});
