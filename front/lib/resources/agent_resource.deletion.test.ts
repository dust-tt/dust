import { Authenticator } from "@app/lib/auth";
import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { GlobalAgentSettingsResource } from "@app/lib/resources/agent/global_agent_settings_resource";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  launchDeleteWorkspaceAgentSearchWorkflow,
  launchIndexAgentSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned agent deletion", () => {
  it("cleans only unmentioned draft versions and preserves dry-run behavior", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const unused = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Unused draft",
      status: "draft",
    });
    const mentioned = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Mentioned draft",
      status: "draft",
    });
    const active = await AgentConfigurationFactory.createTestAgent(auth);
    await MentionFactory.agentMentionedAt(auth, {
      agentId: mentioned.sId,
      mentionedAt: new Date(),
    });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    expect(
      await AgentResource.deleteUnusedDraftConfigurations(auth, {
        dryRun: true,
      })
    ).toEqual({
      configurationCount: 1,
      skippedCount: 1,
    });
    expect(
      await AgentResource.fetchByAgentConfiguration(auth, unused)
    ).toMatchObject({
      sId: unused.sId,
    });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    expect(await AgentResource.deleteUnusedDraftConfigurations(auth)).toEqual({
      configurationCount: 1,
      skippedCount: 1,
    });
    await expect(
      AgentResource.fetchByAgentConfiguration(auth, unused)
    ).rejects.toThrow("Unexpected: agent identity is missing");
    expect(
      await AgentResource.fetchByAgentConfiguration(auth, mentioned)
    ).toMatchObject({
      sId: mentioned.sId,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, active.sId)
    ).not.toBeNull();
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
      agentId: unused.sId,
    });
    expect(
      new Set(
        vi
          .mocked(launchIndexAgentSearchWorkflow)
          .mock.calls.map(([target]) => target.agentId)
      )
    ).toEqual(new Set([unused.sId]));
  });

  it("dry runs author cleanup and preserves another author's version and shared state", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const original = await AgentConfigurationFactory.createTestAgent(auth);
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "admin" });
    const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      editor.sId,
      workspace.sId
    );
    const current = await AgentConfigurationFactory.updateTestAgent(
      editorAuth,
      original.sId
    );
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: original.sId,
      favorite: true,
    });
    const memory = await AgentMemoryResource.makeNew(auth, {
      workspaceId: workspace.id,
      agentConfigurationId: original.sId,
      userId: user.id,
      content: "Keep this memory while another version exists.",
    });
    const identity = await AgentResource.fetchByAgentConfiguration(
      auth,
      current
    );
    if (identity.id === null) {
      throw new Error("Missing stable identity");
    }
    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
        resourceType: "agent",
        resourceId: identity.id,
        grantType: "editor",
      });
    expect(grantGroup).not.toBeNull();
    const before = await AgentSearchDocumentResource.fetchSearchDocument(
      auth,
      current.sId
    );
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    expect(
      await AgentResource.deleteConfigurationsByAuthor(auth, {
        authorModelId: user.id,
        dryRun: true,
      })
    ).toEqual({ configurationCount: 1, agentIds: [original.sId] });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    expect(
      await AgentResource.deleteConfigurationsByAuthor(auth, {
        authorModelId: user.id,
      })
    ).toEqual({ configurationCount: 1, agentIds: [original.sId] });
    expect(
      await AgentResource.deleteConfigurationsByAuthor(auth, {
        authorModelId: user.id,
        dryRun: true,
      })
    ).toEqual({ configurationCount: 0, agentIds: [] });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, current.sId)
    ).toEqual(before);
    expect(
      await AgentMemoryResource.fetchByIds(auth, [memory.sId])
    ).toHaveLength(1);
    expect(
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
        resourceType: "agent",
        resourceId: identity.id,
        grantType: "editor",
      })
    ).toMatchObject({ id: grantGroup?.id });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
      agentId: current.sId,
    });

    await AgentResource.unsafeHardDeleteAgentConfiguration(auth, current);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, current.sId)
    ).toBeNull();
    expect(
      await AgentUserRelationResource.countForAgent(auth, current.sId)
    ).toBe(0);
    expect(await AgentMemoryResource.fetchByIds(auth, [memory.sId])).toEqual(
      []
    );
    expect(
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
        resourceType: "agent",
        resourceId: identity.id,
        grantType: "editor",
      })
    ).toBeNull();
  });

  it("rolls back tool and pod dependencies, then deletes them with the last version", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalSpace,
    } = await createResourceTest({ role: "admin" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const project = await SpaceFactory.project(workspace, user.id);
    await auth.refresh();
    const server = await RemoteMCPServerFactory.create(workspace);
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const action =
      await AgentActionConfigurationResource.createAgentActionConfiguration(
        auth,
        {
          type: "mcp_server_configuration",
          name: "project_tool",
          description: "Pod attachment",
          mcpServerViewId: view.sId,
          dataSources: null,
          tables: null,
          childAgentId: null,
          timeFrame: null,
          jsonSchema: null,
          additionalConfiguration: {},
          dustAppConfiguration: null,
          secretName: null,
          dustProject: { workspaceId: workspace.sId, projectId: project.sId },
        },
        agent
      );
    expect(action.isOk()).toBe(true);
    const withTools = await AgentResource.getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(withTools?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dustProject: { workspaceId: workspace.sId, projectId: project.sId },
        }),
      ])
    );
    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent
    );
    const before = await AgentSearchDocumentResource.fetchSearchDocument(
      auth,
      agent.sId
    );
    const rollback = new Error("Rollback agent deletion");
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await expect(
      withTransaction(
        async (transaction) => {
          await AgentResource.unsafeHardDeleteAgentConfiguration(auth, agent, {
            transaction,
          });
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
    expect(
      await AgentSuggestionResource.fetchById(auth, suggestion.sId)
    ).not.toBeNull();
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    await AgentResource.unsafeHardDeleteAgentConfiguration(auth, agent);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toBeNull();
    expect(
      await AgentSuggestionResource.fetchById(auth, suggestion.sId)
    ).toBeNull();
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });

  it("scrubs only the selected workspace, including global favorites and settings, and retries its index deletion", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const other = await createResourceTest({ role: "admin" });
    const foreign = await AgentConfigurationFactory.createTestAgent(
      other.authenticator
    );
    const globalSettings = {
      agentId: GLOBAL_AGENTS_SID.DUST,
      status: "disabled_by_admin",
    } as const;
    await GlobalAgentSettingsResource.upsert(auth, globalSettings);
    await GlobalAgentSettingsResource.upsert(
      other.authenticator,
      globalSettings
    );
    await AgentUserRelationResource.setFavorite(auth, {
      agentId: GLOBAL_AGENTS_SID.HELPER,
      favorite: true,
    });
    await AgentUserRelationResource.setFavorite(other.authenticator, {
      agentId: foreign.sId,
      favorite: true,
    });
    const before = await AgentSearchDocumentResource.fetchSearchDocument(
      other.authenticator,
      foreign.sId
    );
    vi.mocked(launchDeleteWorkspaceAgentSearchWorkflow).mockClear();
    await AgentResource.deleteAllForWorkspace(auth);
    expect(await GlobalAgentSettingsResource.listForWorkspace(auth)).toEqual(
      []
    );
    expect(
      await GlobalAgentSettingsResource.listForWorkspace(other.authenticator)
    ).toEqual([globalSettings]);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toBeNull();
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
    ).toEqual(before);
    await expect(
      AgentResource.fetchByAgentConfiguration(auth, agent)
    ).rejects.toThrow("Unexpected: agent identity is missing");
    await AgentResource.deleteAllForWorkspace(auth);
    expect(launchDeleteWorkspaceAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    expect(launchDeleteWorkspaceAgentSearchWorkflow).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
    });
  });
});
