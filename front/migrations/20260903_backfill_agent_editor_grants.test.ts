import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { backfillAgentEditorGrants } from "@app/migrations/20260903_backfill_agent_editor_grants";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillAgentEditorGrants", () => {
  it("backfills archived agents idempotently and reports remaining differences", async () => {
    const {
      authenticator,
      user: author,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const [legacyOnlyEditor, grantOnlyEditor, staleEditor] = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);
    await Promise.all([
      MembershipFactory.associate(workspace, legacyOnlyEditor, {
        role: "user",
      }),
      MembershipFactory.associate(workspace, grantOnlyEditor, {
        role: "user",
      }),
      MembershipFactory.associate(workspace, staleEditor, { role: "user" }),
    ]);

    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agent = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );
    const legacyGroupResult = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    if (legacyGroupResult.isErr()) {
      throw legacyGroupResult.error;
    }
    const legacyGroup = legacyGroupResult.value;
    const addLegacyEditor = await legacyGroup.dangerouslyAddMember(
      authenticator,
      { user: legacyOnlyEditor.toJSON() }
    );
    if (addLegacyEditor.isErr()) {
      throw addLegacyEditor.error;
    }
    const removeLegacyAuthor = await legacyGroup.dangerouslyRemoveMember(
      authenticator,
      { user: author.toJSON() }
    );
    if (removeLegacyAuthor.isErr()) {
      throw removeLegacyAuthor.error;
    }

    const firstVersionModel = await AgentConfigurationModel.findOne({
      where: { id: firstVersion.id, workspaceId: workspace.id },
    });
    assert(firstVersionModel);
    // A stale group linked only to an obsolete version must not contribute grants.
    const staleGroup = await GroupResource.makeNew(
      {
        workspaceId: workspace.id,
        name: `Stale editors ${agent.sId}`,
        kind: "agent_editors",
      },
      { memberIds: [staleEditor.id] }
    );
    const staleLink = await staleGroup.addGroupToAgentConfiguration({
      auth: authenticator,
      agentConfiguration: firstVersionModel,
    });
    if (staleLink.isErr()) {
      throw staleLink.error;
    }

    const agentResource = await AgentResource.fetchByAgentConfiguration(
      authenticator,
      agent
    );
    assert(agentResource.id !== null);
    const resourceId = agentResource.id;
    const addGrantEditor = await GroupPermissionResource.grantToUser(
      authenticator,
      {
        user: grantOnlyEditor.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId,
      }
    );
    if (addGrantEditor.isErr()) {
      throw addGrantEditor.error;
    }
    const revokeAuthor = await GroupPermissionResource.revokeFromUser(
      authenticator,
      {
        user: author.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId,
      }
    );
    if (revokeAuthor.isErr()) {
      throw revokeAuthor.error;
    }
    expect(await archiveAgentConfiguration(authenticator, agent.sId)).toBe(
      true
    );

    const firstRun = await backfillAgentEditorGrants({
      execute: true,
      logger,
      workspace,
    });
    expect(firstRun).toEqual({
      agentCount: 1,
      editorGrantsToAdd: 1,
      mismatchedAgentCount: 1,
      authorsWithoutGrantCount: 1,
    });

    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        { grantType: "editor", resourceType: "agent", resourceId }
      );
    assert(grantGroup);
    expect(
      (await grantGroup.getActiveMembers(authenticator))
        .map(({ sId }) => sId)
        .sort()
    ).toEqual([legacyOnlyEditor.sId, grantOnlyEditor.sId].sort());

    await expect(
      backfillAgentEditorGrants({ execute: true, logger, workspace })
    ).resolves.toMatchObject({
      editorGrantsToAdd: 0,
      mismatchedAgentCount: 1,
      authorsWithoutGrantCount: 1,
    });
  });
});
