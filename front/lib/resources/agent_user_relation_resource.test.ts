import { Authenticator } from "@app/lib/auth";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned agent favorite and identity indexation", () => {
  it("backfills missing favorites in bulk, preserves opt-outs and scopes workspace cleanup", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const first = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "First favorite",
    });
    const second = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Second favorite",
    });
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: first.sId,
      favorite: false,
    });
    const other = await createResourceTest({ role: "admin" });
    const foreign = await AgentConfigurationFactory.createTestAgent(
      other.authenticator
    );
    await AgentUserRelationResource.setFavorite(other.authenticator, {
      agentId: foreign.sId,
      favorite: true,
    });
    const agentIds = [
      first.sId,
      first.sId,
      second.sId,
      GLOBAL_AGENTS_SID.HELPER,
    ];
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    expect(
      await AgentUserRelationResource.addMissingFavoritesForWorkspaceMembers(
        auth,
        { agentIds, dryRun: true }
      )
    ).toEqual({ memberCount: 2, createdCount: 0 });
    expect(
      await AgentUserRelationResource.countForAgent(auth, second.sId)
    ).toBe(0);
    await expect(
      AgentUserRelationResource.addMissingFavoritesForWorkspaceMembers(auth, {
        agentIds: [second.sId, foreign.sId],
      })
    ).rejects.toThrow("Agent configuration not found in workspace.");
    expect(
      await AgentUserRelationResource.countForAgent(auth, second.sId)
    ).toBe(0);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    expect(
      await AgentUserRelationResource.addMissingFavoritesForWorkspaceMembers(
        auth,
        { agentIds }
      )
    ).toEqual({ memberCount: 2, createdCount: 5 });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, first.sId)
    ).toMatchObject({ favorite_count: 1 });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, second.sId)
    ).toMatchObject({ favorite_count: 2 });
    expect(
      await AgentUserRelationResource.countForAgent(
        auth,
        GLOBAL_AGENTS_SID.HELPER
      )
    ).toBe(2);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    expect(
      new Set(
        vi
          .mocked(launchIndexAgentSearchWorkflow)
          .mock.calls.map(([target]) => target.agentId)
      )
    ).toEqual(new Set([first.sId, second.sId]));

    expect(
      await AgentUserRelationResource.addMissingFavoritesForWorkspaceMembers(
        auth,
        { agentIds }
      )
    ).toEqual({ memberCount: 2, createdCount: 0 });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, first.sId)
    ).toMatchObject({ favorite_count: 1 });
    await AgentUserRelationResource.deleteAllForWorkspace(auth);
    expect(await AgentUserRelationResource.countForAgent(auth, first.sId)).toBe(
      0
    );
    expect(
      await AgentUserRelationResource.countForAgent(
        auth,
        GLOBAL_AGENTS_SID.HELPER
      )
    ).toBe(0);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        other.authenticator,
        foreign.sId
      )
    ).toMatchObject({ favorite_count: 1 });
  });

  it("refreshes counts for direct favorite writes and batched relation deletion", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: agent.sId,
      favorite: true,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ favorite_count: 1 });
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: agent.sId,
      favorite: false,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ favorite_count: 0 });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: agent.sId,
      favorite: true,
    });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await AgentUserRelationResource.deleteForAgents([agent.sId, agent.sId], {
      workspaceId: workspace.id,
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ favorite_count: 0 });
  });

  it("rolls back authorship, editors and favorites together, then preserves primary preferences on merge", async () => {
    const {
      authenticator: auth,
      workspace,
      user: primaryUser,
    } = await createResourceTest({ role: "admin" });
    const secondaryUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondaryUser, {
      role: "user",
    });
    const secondaryAuth = await Authenticator.fromUserIdAndWorkspaceId(
      secondaryUser.sId,
      workspace.sId
    );
    const agent =
      await AgentConfigurationFactory.createTestAgent(secondaryAuth);
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: agent.sId,
      favorite: false,
    });
    await AgentUserRelationResource.setFavorite(secondaryAuth, {
      agentId: agent.sId,
      favorite: true,
    });
    const before = await AgentSearchDocumentResource.fetchSearchDocument(
      auth,
      agent.sId
    );
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const rollback = new Error("Roll back identity merge");

    await expect(
      withTransaction(
        async (transaction) => {
          await AgentResource.transferAuthorship(
            auth,
            { primaryUser, secondaryUser },
            { transaction }
          );
          await GroupResource.migrateUserMemberships(auth, {
            primaryUser,
            secondaryUser,
            transaction,
          });
          await AgentUserRelationResource.migrateUserRelations(
            auth,
            { primaryUser, secondaryUser },
            { transaction }
          );
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toEqual(before);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    await AgentResource.transferAuthorship(auth, {
      primaryUser,
      secondaryUser,
    });
    await GroupResource.migrateUserMemberships(auth, {
      primaryUser,
      secondaryUser,
    });
    await AgentUserRelationResource.migrateUserRelations(auth, {
      primaryUser,
      secondaryUser,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({
      edited_by: primaryUser.id,
      editor_user_ids: [primaryUser.id],
      favorite_count: 0,
    });
    expect(
      new Set(
        vi
          .mocked(launchIndexAgentSearchWorkflow)
          .mock.calls.map(([target]) => target.agentId)
      )
    ).toEqual(new Set([agent.sId]));
    expect(await AgentUserRelationResource.countForAgent(auth, agent.sId)).toBe(
      1
    );
  });
});
