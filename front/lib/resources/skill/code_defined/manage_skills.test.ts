import { manageSkillsSkill } from "@app/lib/resources/skill/code_defined/manage_skills";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("manageSkillsSkill", () => {
  it("is restricted until skill edition tools are enabled", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    expect(await manageSkillsSkill.isRestricted(authenticator)).toBe(true);

    await FeatureFlagFactory.basic(authenticator, "skill_edition_tools");

    expect(await manageSkillsSkill.isRestricted(authenticator)).toBe(false);
  });

  it("is restricted for non-builders even when skill edition tools are enabled", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    await FeatureFlagFactory.basic(authenticator, "skill_edition_tools");

    expect(await manageSkillsSkill.isRestricted(authenticator)).toBe(true);
  });
});
