import { resolveEnabledSkillReferencesForAgentLoop } from "@app/lib/api/assistant/skill_references";
import { getEnabledSkillInstructions } from "@app/lib/api/assistant/skills_rendering";
import { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("agent loop skill reference availability", () => {
  it("replaces unavailable skill references in skill instructions", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const requestUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, requestUser, {
      role: "user",
    });
    const requestAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );

    const accessibleSkill = await SkillFactory.create(adminAuth, {
      name: "Accessible skill",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const inaccessibleSkill = await SkillFactory.create(adminAuth, {
      name: "Restricted skill",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const skill = await SkillFactory.create(adminAuth, {
      name: "Parent skill",
      instructions:
        `Use <skill id="${accessibleSkill.sId}" name="${accessibleSkill.name}" /> ` +
        `and <skill id="${inaccessibleSkill.sId}" name="${inaccessibleSkill.name}" />.`,
    });

    const [renderedSkill] = await resolveEnabledSkillReferencesForAgentLoop(
      requestAuth,
      [SkillFactory.withExtendedSkill(skill)]
    );

    const instructions = getEnabledSkillInstructions(renderedSkill);

    expect(instructions).toContain(
      `<skill id="${accessibleSkill.sId}" name="${accessibleSkill.name}" />`
    );
    expect(instructions).toContain(
      `<unavailable_skill id="${inaccessibleSkill.sId}" />`
    );
  });
});
