import { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import * as skillIndex from "@app/lib/skill_search";
import { indexSkillSearchActivity } from "@app/temporal/es_indexation/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
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
  });

  it.each([
    false,
    true,
  ])("includes the global space exactly once when already requested: %s", async (alreadyRequested) => {
    const {
      authenticator: auth,
      workspace,
      globalSpace,
    } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: alreadyRequested ? [globalSpace.id] : [],
    });
    if (!alreadyRequested) {
      // Legacy rows can still lack the global space even though new writes include it.
      await SkillConfigurationModel.update(
        { requestedSpaceIds: [] },
        { where: { id: skill.id, workspaceId: workspace.id } }
      );
    }

    await indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });

    expect(skillIndex.indexSkillDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        requested_space_ids: [globalSpace.sId],
      })
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
  ] as const)("indexes metadata for a restricted %s space without read access", async (kind) => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalSpace,
    } = await createResourceTest({ role: "admin" });
    const space = await SpaceFactory[kind](workspace);
    const server = await RemoteMCPServerFactory.create(workspace);
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      space
    );
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
      requestedSpaceIds: [space.id],
      mcpServerViews: [serverView],
    });
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    expect(await SkillResource.fetchById(internalAuth, skill.sId)).toBeNull();
    const target = { workspaceId: workspace.sId, skillId: skill.sId };

    await indexSkillSearchActivity(target);
    expect(skillIndex.indexSkillDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        skill_id: skill.sId,
        workspace_id: workspace.sId,
        name: skill.name,
        description: skill.userFacingDescription,
        availability: "editors",
        requested_space_ids: [space.sId, globalSpace.sId],
        editor_ids: [user.sId],
        last_edited_by_user_id: user.sId,
        mcp_server_view_ids: [serverView.sId],
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

  it("upserts active and archived skills but skips suggested and missing skills", async () => {
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

    expect((await skill.delete(auth)).isOk()).toBe(true);
    await indexSkillSearchActivity(target);
    const suggestion = await SkillFactory.create(auth, { status: "suggested" });
    await indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: suggestion.sId,
    });
    expect(skillIndex.indexSkillDocument).toHaveBeenCalledTimes(3);
  });
});
