import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import { describe, expect, it } from "vitest";

describe("GLOBAL_SKILL_SEARCH_ALIASES", () => {
  it("only defines aliases for global skills", () => {
    const globalSkillIds = new Set<string>(
      GLOBAL_SKILLS_ARRAY.map((skill) => skill.sId)
    );

    expect(
      Object.keys(GLOBAL_SKILL_SEARCH_ALIASES).filter(
        (skillId) => !globalSkillIds.has(skillId)
      )
    ).toEqual([]);
  });
});
