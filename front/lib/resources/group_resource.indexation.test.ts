import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSearchIndexationResource } from "@app/lib/resources/group_search_indexation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  launchIndexAgentSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err } from "@app/types/shared/result";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

async function createEditorFixtures() {
  const context = await createResourceTest({ role: "admin" });
  const { authenticator: auth, workspace } = context;
  const skill = await SkillFactory.create(auth);
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const skillGroup = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    {
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    }
  );
  const agentGroup = await GroupResource.findEditorGroupForAgent(auth, agent);
  const identity = await AgentResource.fetchByAgentConfiguration(auth, agent);
  assert(identity.id !== null);
  const agentGrantGroup =
    await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
      grantType: "editor",
      resourceType: "agent",
      resourceId: identity.id,
    });
  assert(skillGroup && agentGroup.isOk() && agentGrantGroup);
  const editor = await UserFactory.basic();
  await MembershipFactory.associate(workspace, editor, { role: "user" });
  vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
  vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
  return {
    ...context,
    auth,
    skill,
    agent,
    skillGroup,
    agentGroup: agentGroup.value,
    agentGrantGroup,
    editor,
  };
}

describe("resource-owned editor membership search indexation", () => {
  it("refreshes the editor projection when a grant changes without a membership change", async () => {
    const { auth, workspace, user, skill, skillGroup } =
      await createEditorFixtures();
    const grantSpec = {
      group: skillGroup,
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    } as const;
    await GroupPermissionResource.revoke(auth, grantSpec);
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ editor_user_ids: [] });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });

    const grant = await GroupPermissionResource.grant(auth, grantSpec);
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ editor_user_ids: [user.id] });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledTimes(2);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const rollback = new Error("Roll back grant deletion");
    await expect(
      withTransaction(
        async (transaction) => {
          await grant.delete(auth, { transaction });
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ editor_user_ids: [user.id] });
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();

    await grant.delete(auth);
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ editor_user_ids: [] });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("batches direct grant insertion/deletion and excludes unrelated or foreign targets", async () => {
    const { auth, workspace, skill, agent } = await createEditorFixtures();
    const identity = await AgentResource.fetchByAgentConfiguration(auth, agent);
    assert(identity.id !== null);
    const group = await GroupFactory.regularManual(
      workspace,
      "Direct grant group"
    );
    const other = await createResourceTest({ role: "admin" });
    const foreignSkill = await SkillFactory.create(other.authenticator);
    const foreignGrants = await GroupPermissionResource.listForResource(
      other.authenticator,
      {
        resourceType: "skill",
        resourceId: foreignSkill.id,
      }
    );
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const skillGrant = {
      group,
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    } as const;
    await GroupPermissionResource.grantMany(auth, {
      grants: [
        skillGrant,
        skillGrant,
        {
          group,
          grantType: "editor",
          resourceType: "agent",
          resourceId: identity.id,
        },
      ],
    });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    const grants = await GroupPermissionResource.listForGroup(auth, group);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await GroupPermissionResource.deleteByModelIds(
      auth,
      [...grants, ...foreignGrants].map((grant) => grant.id)
    );
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(
      await GroupPermissionResource.listForResource(other.authenticator, {
        resourceType: "skill",
        resourceId: foreignSkill.id,
      })
    ).toHaveLength(foreignGrants.length);
  });

  it("batches and deduplicates both kinds of editor target, excluding foreign groups and space viewers", async () => {
    const {
      auth,
      workspace,
      skill,
      agent,
      skillGroup,
      agentGroup,
      agentGrantGroup: grantGroup,
    } = await createEditorFixtures();
    await AgentConfigurationFactory.updateTestAgent(auth, agent.sId);
    const space = await SpaceFactory.regular(workspace);
    const viewerGroup = await GroupFactory.regularManual(
      workspace,
      "Space viewers"
    );
    await SpaceFactory.attachGroup(space, viewerGroup);
    const other = await createResourceTest({ role: "admin" });
    const foreign = await SkillFactory.create(other.authenticator);
    const foreignGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        other.authenticator,
        {
          grantType: "editor",
          resourceType: "skill",
          resourceId: foreign.id,
        }
      );
    assert(foreignGroup);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    await GroupSearchIndexationResource.launchForGroups({
      workspace,
      groupModelIds: [
        skillGroup.id,
        skillGroup.id,
        agentGroup.id,
        grantGroup.id,
        viewerGroup.id,
        foreignGroup.id,
      ],
    });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await GroupSearchIndexationResource.launchForGroups({
      workspace,
      groupModelIds: [viewerGroup.id, foreignGroup.id],
    });
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("indexes direct editor-group additions and removals without caller hooks", async () => {
    const { auth, workspace, skill, agent, skillGroup, agentGroup, editor } =
      await createEditorFixtures();
    for (const group of [skillGroup, agentGroup]) {
      expect(
        (
          await group.dangerouslyAddMember(auth, { user: editor.toJSON() })
        ).isOk()
      ).toBe(true);
      expect(
        (await group.getActiveMembers(auth)).map((user) => user.id)
      ).toContain(editor.id);
      expect(
        (
          await group.dangerouslyRemoveMember(auth, { user: editor.toJSON() })
        ).isOk()
      ).toBe(true);
      expect(
        (await group.getActiveMembers(auth)).map((user) => user.id)
      ).not.toContain(editor.id);
    }
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledTimes(2);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });

  it.each([
    "skill",
    "agent",
  ] as const)("captures the %s target before group deletion and suppresses indexing on rollback", async (type) => {
    const { auth, workspace, user, skill, agent, skillGroup, agentGroup } =
      await createEditorFixtures();
    const group = type === "skill" ? skillGroup : agentGroup;
    const rollback = new Error("Rollback group deletion");
    await expect(
      withTransaction(
        async (transaction) => {
          expect((await group.delete(auth, { transaction })).isOk()).toBe(true);
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      (await group.getActiveMembers(auth)).map((member) => member.id)
    ).toEqual([user.id]);

    expect((await group.delete(auth)).isOk()).toBe(true);
    expect(
      await GroupResource.dangerouslyFetchByModelIds(auth, [group.id], {
        groupKinds: [group.kind],
      })
    ).toEqual([]);
    if (type === "skill") {
      expect(
        await GroupPermissionResource.listForGroups(workspace, {
          groupModelIds: [group.id],
        })
      ).toEqual([]);
      expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
        workspaceId: workspace.sId,
        skillId: skill.sId,
      });
      expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    } else {
      expect(
        await GroupResource.findAgentIdsForGroups(auth, [group.id])
      ).toEqual([]);
      expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
        workspaceId: workspace.sId,
        agentId: agent.sId,
      });
      expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    }
  });

  it("indexes both resource kinds when ended editor memberships are restored", async () => {
    const { auth, workspace, user, skill, agent, skillGroup, agentGroup } =
      await createEditorFixtures();
    const revokedAt = new Date();
    await skillGroup.dangerouslyRemoveMember(auth, { user: user.toJSON() });
    await agentGroup.dangerouslyRemoveMember(auth, { user: user.toJSON() });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const groups =
      await GroupResource.dangerouslyRestoreGroupMembershipsRevokedWith({
        user,
        workspace,
        revokedAt,
      });
    expect(new Set(groups)).toEqual(new Set([skillGroup.id, agentGroup.id]));
    expect(
      (await skillGroup.getActiveMembers(auth)).map((member) => member.id)
    ).toEqual([user.id]);
    expect(
      (await agentGroup.getActiveMembers(auth)).map((member) => member.id)
    ).toEqual([user.id]);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });

  it("does not reindex workspace membership changes when editor grant holders are unchanged", async () => {
    const { auth, workspace, user, editor, skill, skillGroup, agentGroup } =
      await createEditorFixtures();
    await skillGroup.dangerouslyAddMember(auth, { user: editor.toJSON() });
    await agentGroup.dangerouslyAddMember(auth, { user: editor.toJSON() });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    expect(
      (
        await MembershipResource.revokeMembership({ user: editor, workspace })
      ).isOk()
    ).toBe(true);
    expect((await skill.listEditors(auth))?.map((member) => member.id)).toEqual(
      [user.id]
    );
    expect(
      (
        await SkillResource.batchListEditorGrantUserIdsByModelId(auth, [
          skill.id,
        ])
      )
        .get(skill.id)
        ?.sort()
    ).toEqual([user.id, editor.id].sort());
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    expect(
      new Set((await skill.listEditors(auth))?.map((member) => member.id))
    ).toEqual(new Set([user.id, editor.id]));
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("retries both resource targets after membership migration committed but indexation failed", async () => {
    const {
      auth,
      workspace,
      user,
      editor,
      skill,
      agent,
      skillGroup,
      agentGroup,
      agentGrantGroup,
    } = await createEditorFixtures();
    await skillGroup.dangerouslyAddMember(auth, { user: editor.toJSON() });
    await agentGroup.dangerouslyAddMember(auth, { user: editor.toJSON() });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const launchError = new Error("Temporal unavailable");
    vi.mocked(launchIndexAgentSearchWorkflow).mockResolvedValueOnce(
      new Err(launchError)
    );
    await expect(
      GroupResource.migrateUserMemberships(auth, {
        primaryUser: user,
        secondaryUser: editor,
      })
    ).rejects.toBe(launchError);
    expect(
      (await skillGroup.getActiveMembers(auth)).map((member) => member.id)
    ).toEqual([user.id]);
    expect(
      (await agentGroup.getActiveMembers(auth)).map((member) => member.id)
    ).toEqual([user.id]);

    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const groups = await GroupResource.migrateUserMemberships(auth, {
      primaryUser: user,
      secondaryUser: editor,
    });
    expect(new Set(groups)).toEqual(
      new Set([skillGroup.id, agentGroup.id, agentGrantGroup.id])
    );
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });
});
