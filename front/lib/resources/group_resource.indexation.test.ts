import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { launchSkillSearchIndexationForGrants } from "@app/lib/skill_search/indexation";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

async function createEditorFixtures() {
  const context = await createResourceTest({ role: "admin" });
  const { authenticator: auth } = context;
  const skill = await SkillFactory.create(auth);
  const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    {
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    }
  );
  assert(group);
  vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
  return { ...context, auth, skill, group };
}

describe("resource-owned skill editor indexation", () => {
  it("refreshes direct editor grant changes without a membership change", async () => {
    const { auth, workspace, user, skill, group } =
      await createEditorFixtures();
    const grantSpec = {
      group,
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    } as const;
    await GroupPermissionResource.revoke(auth, grantSpec);
    const revoked = await skill.listEditors(auth);
    expect(revoked ?? []).toEqual([]);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });

    const grant = await GroupPermissionResource.grant(auth, grantSpec);
    const granted = await skill.listEditors(auth);
    expect(granted?.map((editor) => editor.sId)).toEqual([user.sId]);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const rollback = new Error("Roll back grant deletion");
    const deletion = withTransaction((parent) =>
      frontSequelize.transaction(
        { transaction: parent },
        async (transaction) => {
          await grant.delete(auth, { transaction });
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        }
      )
    );
    await expect(deletion).rejects.toBe(rollback);
    const unchanged = await skill.listEditors(auth);
    expect(unchanged?.map((editor) => editor.sId)).toEqual([user.sId]);
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    await grant.delete(auth);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });

  it("indexes editor membership changes without caller hooks", async () => {
    const { auth, workspace, skill, group } = await createEditorFixtures();
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    const added = await group.dangerouslyAddMember(auth, {
      user: editor.toJSON(),
    });
    expect(added.isOk()).toBe(true);
    const granted = await skill.listEditors(auth);
    expect(granted?.map((user) => user.sId)).toContain(editor.sId);
    const removed = await group.dangerouslyRemoveMember(auth, {
      user: editor.toJSON(),
    });
    expect(removed.isOk()).toBe(true);
    const revoked = await skill.listEditors(auth);
    expect(revoked?.map((user) => user.sId)).not.toContain(editor.sId);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledTimes(2);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });

  it("captures targets before group deletion and skips rolled-back changes", async () => {
    const { auth, workspace, skill, group } = await createEditorFixtures();
    const rollback = new Error("Rollback group deletion");
    const deletion = withTransaction((parent) =>
      frontSequelize.transaction(
        { transaction: parent },
        async (transaction) => {
          const result = await group.delete(auth, { transaction });
          expect(result.isOk()).toBe(true);
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        }
      )
    );
    await expect(deletion).rejects.toBe(rollback);
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    const result = await group.delete(auth);
    expect(result.isOk()).toBe(true);
    const groups = await GroupResource.dangerouslyFetchByModelIds(
      auth,
      [group.id],
      { groupKinds: [group.kind] }
    );
    expect(groups).toEqual([]);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });

  it("deduplicates targets and ignores foreign groups", async () => {
    const { workspace, skill, group } = await createEditorFixtures();
    const foreign = await createEditorFixtures();
    await GroupResource.launchSkillSearchIndexationForGroups({
      workspace,
      groupModelIds: [group.id, group.id, foreign.group.id],
    });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });

  it("ignores unrelated and type-wide grants when scheduling skill refreshes", async () => {
    const { workspace, skill } = await createEditorFixtures();
    const editorGrant = {
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    } as const;
    await launchSkillSearchIndexationForGrants({
      workspace,
      grants: [
        { ...editorGrant, resourceId: -1 },
        { ...editorGrant, resourceType: "agent" },
        { ...editorGrant, grantType: "reader" },
      ],
    });
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    await launchSkillSearchIndexationForGrants({
      workspace,
      grants: [editorGrant, editorGrant],
    });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });
});
