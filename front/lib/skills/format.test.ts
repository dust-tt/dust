import { describe, expect, it } from "vitest";

import { renameSkillReferencesInContent } from "./format";

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
