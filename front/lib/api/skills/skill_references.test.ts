import {
  replaceUnavailableSkillReferencesForFrontend,
  restoreUnavailableSkillReferencesForPersistence,
} from "@app/lib/api/skills/skill_references";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("skill reference availability", () => {
  async function setup() {
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

    return {
      accessibleSkill,
      adminAuth,
      inaccessibleSkill,
      requestAuth,
      restrictedSpace,
    };
  }

  it("replaces unavailable skill references in serialized skill instructions", async () => {
    const { accessibleSkill, adminAuth, inaccessibleSkill, requestAuth } =
      await setup();

    expect(
      await SkillResource.fetchById(requestAuth, inaccessibleSkill.sId)
    ).toBeNull();

    const skill = await SkillFactory.create(adminAuth, {
      instructions:
        `Use <skill id="${accessibleSkill.sId}" name="${accessibleSkill.name}" /> ` +
        `and <skill id="${inaccessibleSkill.sId}" name="${inaccessibleSkill.name}" />.`,
      instructionsHtml:
        `<p>Use <skill id="${accessibleSkill.sId}" name="${accessibleSkill.name}"></skill> ` +
        `and <skill id="${inaccessibleSkill.sId}" name="${inaccessibleSkill.name}"></skill>.</p>`,
    });

    const renderedSkill = await replaceUnavailableSkillReferencesForFrontend(
      requestAuth,
      skill.toJSON(adminAuth)
    );

    expect(renderedSkill.instructions).toContain(
      `<skill id="${accessibleSkill.sId}" name="${accessibleSkill.name}" />`
    );
    expect(renderedSkill.instructions).toContain(
      `<unavailable_skill id="${inaccessibleSkill.sId}" />`
    );
    expect(renderedSkill.instructionsHtml).toContain(
      `<unavailable_skill id="${inaccessibleSkill.sId}"></unavailable_skill>`
    );
  });

  it("uses parent requested spaces instead of requester permissions", async () => {
    const { adminAuth, inaccessibleSkill, restrictedSpace } = await setup();
    const addAdminToRestrictedSpaceRes = await restrictedSpace.addMembers(
      adminAuth,
      { userIds: [adminAuth.getNonNullableUser().sId] }
    );
    expect(addAdminToRestrictedSpaceRes.isOk()).toBe(true);
    await adminAuth.refresh();

    expect(
      await SkillResource.fetchById(adminAuth, inaccessibleSkill.sId)
    ).not.toBeNull();

    const parentWithoutChildSpaces = await SkillFactory.create(adminAuth, {
      name: "Parent without child spaces",
      instructions: `Use <skill id="${inaccessibleSkill.sId}" name="${inaccessibleSkill.name}" />.`,
    });

    const renderedParentWithoutChildSpaces =
      await replaceUnavailableSkillReferencesForFrontend(
        adminAuth,
        parentWithoutChildSpaces.toJSON(adminAuth)
      );

    expect(renderedParentWithoutChildSpaces.instructions).toContain(
      `<unavailable_skill id="${inaccessibleSkill.sId}" />`
    );

    const parentWithChildSpaces = await SkillFactory.create(adminAuth, {
      name: "Parent with child spaces",
      instructions: `Use <skill id="${inaccessibleSkill.sId}" name="${inaccessibleSkill.name}" />.`,
      requestedSpaceIds: [restrictedSpace.id],
    });

    const renderedParentWithChildSpaces =
      await replaceUnavailableSkillReferencesForFrontend(
        adminAuth,
        parentWithChildSpaces.toJSON(adminAuth)
      );

    expect(renderedParentWithChildSpaces.instructions).toContain(
      `<skill id="${inaccessibleSkill.sId}" name="${inaccessibleSkill.name}" />`
    );
  });

  it("restores unavailable skill references before persistence", async () => {
    const current = {
      instructions:
        'Use <skill id="skill_123" name="Restricted child skill" />.',
      instructionsHtml:
        '<p>Use <skill id="skill_123" name="Restricted child skill"></skill>.</p>',
    };

    const result = restoreUnavailableSkillReferencesForPersistence({
      current,
      updated: {
        instructions: 'Use <unavailable_skill id="skill_123" />.',
        instructionsHtml:
          '<p>Use <unavailable_skill id="skill_123"></unavailable_skill>.</p>',
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(current);
    }
  });

  it("rejects unavailable skill references without matching persisted references", () => {
    const result = restoreUnavailableSkillReferencesForPersistence({
      current: {
        instructions: "No skill reference.",
        instructionsHtml: null,
      },
      updated: {
        instructions: 'Use <unavailable_skill id="skill_123" />.',
        instructionsHtml: null,
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("skill_123");
    }
  });
});
