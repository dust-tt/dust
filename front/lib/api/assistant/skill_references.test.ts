import {
  resolveEnabledSkillReferencesForAgentLoop,
  resolveSkillReferencesForAgentLoop,
} from "@app/lib/api/assistant/skill_references";
import { getEnabledSkillInstructions } from "@app/lib/api/assistant/skills_rendering";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("agent loop skill reference availability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses parent requested spaces for enabled and extended skill references", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addAdminToRestrictedSpaceRes = await restrictedSpace.addMembers(
      adminAuth,
      { userIds: [adminAuth.getNonNullableUser().sId] }
    );
    expect(addAdminToRestrictedSpaceRes.isOk()).toBe(true);
    await adminAuth.refresh();

    const restrictedChildSkill = await SkillFactory.create(adminAuth, {
      name: "Restricted child skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    expect(
      await SkillResource.fetchById(adminAuth, restrictedChildSkill.sId)
    ).not.toBeNull();

    const parentWithoutChildSpaces = await SkillFactory.create(adminAuth, {
      name: "Parent without child spaces",
      instructions: `Use <skill id="${restrictedChildSkill.sId}" name="${restrictedChildSkill.name}" />.`,
    });
    const parentWithChildSpaces = await SkillFactory.create(adminAuth, {
      name: "Parent with child spaces",
      instructions: `Use <skill id="${restrictedChildSkill.sId}" name="${restrictedChildSkill.name}" />.`,
      requestedSpaceIds: [restrictedSpace.id],
    });
    const parentWithExtendedSkill = await SkillFactory.create(adminAuth, {
      name: "Parent with extended skill",
      instructions: "Base instructions.",
    });
    const extendedSkill = await SkillFactory.create(adminAuth, {
      name: "Extended skill",
      instructions: `Extend with <skill id="${restrictedChildSkill.sId}" name="${restrictedChildSkill.name}" />.`,
      requestedSpaceIds: [restrictedSpace.id],
    });

    const findAllSpy = vi.spyOn(SkillConfigurationModel, "findAll");

    const [
      renderedParentWithoutChildSpaces,
      renderedParentWithChildSpaces,
      renderedParentWithExtendedSkill,
    ] = await resolveEnabledSkillReferencesForAgentLoop(adminAuth, [
      SkillFactory.withExtendedSkill(parentWithoutChildSpaces),
      SkillFactory.withExtendedSkill(parentWithChildSpaces),
      SkillFactory.withExtendedSkill(parentWithExtendedSkill, extendedSkill),
    ]);

    const instructionsWithoutChildSpaces = getEnabledSkillInstructions(
      renderedParentWithoutChildSpaces
    );
    const instructionsWithChildSpaces = getEnabledSkillInstructions(
      renderedParentWithChildSpaces
    );
    const extendedInstructions = getEnabledSkillInstructions(
      renderedParentWithExtendedSkill
    );

    expect(instructionsWithoutChildSpaces).toContain(
      `<unavailable_skill id="${restrictedChildSkill.sId}" />`
    );
    expect(instructionsWithChildSpaces).toContain(
      `<skill id="${restrictedChildSkill.sId}" name="${restrictedChildSkill.name}" />`
    );
    expect(extendedInstructions).toContain(
      `<skill id="${restrictedChildSkill.sId}" name="${restrictedChildSkill.name}" />`
    );
    expect(findAllSpy).toHaveBeenCalledTimes(1);
  });

  it("uses parent requested spaces for system skill references", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const restrictedChildSkill = await SkillFactory.create(adminAuth, {
      name: "Restricted child skill",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const systemSkill = await SkillFactory.create(adminAuth, {
      name: "System skill",
      instructions: `Use <skill id="${restrictedChildSkill.sId}" name="${restrictedChildSkill.name}" />.`,
    });

    const [renderedSystemSkill] = await resolveSkillReferencesForAgentLoop(
      adminAuth,
      [systemSkill]
    );

    expect(renderedSystemSkill.instructionsOverride).toContain(
      `<unavailable_skill id="${restrictedChildSkill.sId}" />`
    );
  });
});
