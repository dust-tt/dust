import * as skillIndex from "@app/lib/skill_search";
import { indexSkillSearchActivity } from "@app/temporal/es_indexation/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("skill search indexing activity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(skillIndex, "indexSkillDocument").mockResolvedValue(
      new Ok(undefined)
    );
    vi.spyOn(skillIndex, "deleteSkillDocument").mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("fetches current editors and resolves the last editor independently", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    expect((await skill.addEditors(auth, [editor])).isOk()).toBe(true);
    expect((await skill.removeEditors(auth, [user])).isOk()).toBe(true);

    await indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });

    expect(skillIndex.indexSkillDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        skill_id: skill.sId,
        last_edited_by_user_id: user.sId,
        editor_ids: [editor.sId],
      })
    );
  });

  it.each([
    "regular",
    "project",
  ] as const)("uses normal resource access for a restricted %s space", async (kind) => {
    const {
      authenticator: auth,
      workspace,
      globalGroup,
    } = await createResourceTest({ role: "admin" });
    const space = await SpaceFactory[kind](workspace);
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [space.id],
    });
    const target = { workspaceId: workspace.sId, skillId: skill.sId };

    await indexSkillSearchActivity(target);
    expect(skillIndex.indexSkillDocument).not.toHaveBeenCalled();
    expect(skillIndex.deleteSkillDocument).toHaveBeenCalledExactlyOnceWith(
      target
    );

    await SpaceFactory.attachGroup(space, globalGroup);
    await indexSkillSearchActivity(target);
    expect(skillIndex.indexSkillDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        skill_id: skill.sId,
        requested_space_ids: [space.sId],
      })
    );
  });

  it("does not index a skill from another workspace", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const otherSkill = await SkillFactory.create(otherAuth);

    await indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: otherSkill.sId,
    });
    expect(skillIndex.indexSkillDocument).not.toHaveBeenCalled();
    await indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(skillIndex.indexSkillDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ skill_id: skill.sId })
    );
  });

  it("upserts active and archived skills but deletes suggested and missing documents", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const target = { workspaceId: workspace.sId, skillId: skill.sId };

    await indexSkillSearchActivity(target);
    expect(skillIndex.indexSkillDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill_id: skill.sId, status: "active" })
    );
    await skill.archive(auth);
    await indexSkillSearchActivity(target);
    expect(skillIndex.indexSkillDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill_id: skill.sId, status: "archived" })
    );
    await skill.restore(auth);
    await indexSkillSearchActivity(target);
    expect(skillIndex.indexSkillDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill_id: skill.sId, status: "active" })
    );
    expect(skillIndex.deleteSkillDocument).not.toHaveBeenCalled();

    expect((await skill.delete(auth)).isOk()).toBe(true);
    await indexSkillSearchActivity(target);
    expect(skillIndex.deleteSkillDocument).toHaveBeenLastCalledWith(target);
    const suggestion = await SkillFactory.create(auth, { status: "suggested" });
    await indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: suggestion.sId,
    });
    expect(skillIndex.deleteSkillDocument).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      skillId: suggestion.sId,
    });
    expect(skillIndex.indexSkillDocument).toHaveBeenCalledTimes(3);
  });
});
