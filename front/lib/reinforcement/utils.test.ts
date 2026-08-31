import { getAuthForWorkspace } from "@app/lib/reinforcement/utils";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { describe, expect, it } from "vitest";

describe("getAuthForWorkspace", () => {
  it("returns an auth that can edit skills", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    const skill = await SkillFactory.create(authenticator);

    const auth = await getAuthForWorkspace(workspace.sId);

    const fetchedSkill = await SkillResource.fetchById(auth, skill.sId);
    expect(fetchedSkill).not.toBeNull();
    expect(fetchedSkill?.canWrite(auth)).toBe(true);
  });
});
