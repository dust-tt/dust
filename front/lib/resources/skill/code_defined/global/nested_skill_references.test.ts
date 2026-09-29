import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { extractUniqueSkillIds } from "@app/lib/skills/format";
import { expect, it } from "vitest";

it("keeps static global skill tags aligned with declared children", () => {
  for (const skill of GLOBAL_SKILLS_ARRAY) {
    if (!("instructions" in skill) || skill.instructions === undefined) {
      continue;
    }

    expect(extractUniqueSkillIds(skill.instructions).sort()).toEqual(
      [...GlobalSkillsRegistry.getChildSkillIds(skill.sId)].sort()
    );
  }
});
