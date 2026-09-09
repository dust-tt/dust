import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import {
  destroyAgentMCPServerConfigurationsForViews,
  destroyMCPServerViewDependencies,
} from "@app/lib/resources/mcp_server_view_helper";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  launchIndexAgentSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

async function setup(spaceKind: "global" | "regular" = "global") {
  const {
    authenticator: auth,
    workspace,
    user,
    globalSpace,
    globalGroup,
  } = await createResourceTest({ role: "admin" });
  const server = await RemoteMCPServerFactory.create(workspace);
  const space =
    spaceKind === "global"
      ? globalSpace
      : await SpaceFactory.regular(workspace);
  if (spaceKind === "regular") {
    await SpaceFactory.attachGroup(space, globalGroup);
  }
  const view = await MCPServerViewFactory.create(workspace, server.sId, space);
  const project = await SpaceFactory.project(workspace, user.id);
  await auth.refresh();
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const skill = await SkillFactory.create(auth, { mcpServerViews: [view] });
  const action =
    await AgentActionConfigurationResource.createAgentActionConfiguration(
      auth,
      {
        type: "mcp_server_configuration",
        name: "project_tool",
        description: "Tool with a pod dependency",
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
  const fullAgent = await AgentResource.getAgentConfiguration(auth, {
    agentId: agent.sId,
    variant: "full",
  });
  expect(fullAgent?.actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dustProject: { workspaceId: workspace.sId, projectId: project.sId },
      }),
    ])
  );
  return { auth, workspace, server, view, agent, skill, globalSpace };
}

describe("MCP view search invalidation", () => {
  it("removes attachments on global sharing and defers invalidation to commit", async () => {
    const { auth, server, view, agent, skill, globalSpace } =
      await setup("regular");
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );
    assert(systemView);
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const promoted = await withTransaction(async (transaction) => {
      // Observe the real transaction: test isolation holds its outer commit open.
      const afterCommit = vi.spyOn(transaction, "afterCommit");
      try {
        const result = await MCPServerViewResource.create(auth, {
          systemView,
          space: globalSpace,
        });
        expect(afterCommit.mock.calls.length).toBeGreaterThanOrEqual(2);
        return result;
      } finally {
        afterCommit.mockRestore();
      }
    });
    expect(promoted.view.space.kind).toBe("global");
    expect(promoted.affectedAgents).toEqual([
      expect.objectContaining({ sId: agent.sId }),
    ]);
    expect(await MCPServerViewResource.fetchById(auth, view.sId)).toBeNull();
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [] });
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ tools: [] });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("preserves stored attachment IDs on soft deletion without reindexing", async () => {
    const { auth, view, agent, skill } = await setup();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const deleted = await view.delete(auth, { hardDelete: false });
    expect(deleted.isOk()).toBe(true);
    expect(await MCPServerViewResource.fetchById(auth, view.sId)).toBeNull();
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [view.sId] });
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ tools: [view.sId] });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("removes only local agent tools and their pod children, preserving skills and foreign agents", async () => {
    const local = await setup();
    const other = await setup();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    await destroyAgentMCPServerConfigurationsForViews(local.auth, {
      mcpServerViewIds: [local.view.id, other.view.id],
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        local.auth,
        local.agent.sId
      )
    ).toMatchObject({ tools: [] });
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(
        local.auth,
        local.skill.sId
      )
    ).toMatchObject({ tools: [local.view.sId] });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        other.auth,
        other.agent.sId
      )
    ).toMatchObject({ tools: [other.view.sId] });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: local.workspace.sId,
      agentId: local.agent.sId,
    });
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("rolls back view, skill and agent tool deletion together without launching indexation", async () => {
    const { auth, view, agent, skill } = await setup();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const rollback = new Error("Rollback view and tools");
    await expect(
      withTransaction(
        async (transaction) => {
          const result = await view.hardDelete(auth, transaction);
          expect(result.isOk()).toBe(true);
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await MCPServerViewResource.fetchById(auth, view.sId)
    ).not.toBeNull();
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [view.sId] });
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ tools: [view.sId] });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();

    await destroyMCPServerViewDependencies(auth, {
      mcpServerViewIds: [view.id],
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [] });
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ tools: [] });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: auth.getNonNullableWorkspace().sId,
      skillId: skill.sId,
    });
  });

  it("rolls back skills-only changes and server deletion with their agent and skill tools", async () => {
    const { auth, view, server, agent, skill } = await setup();
    const rollback = new Error("Rollback server mutation");
    await expect(
      withTransaction(
        async (transaction) => {
          const result = await view.updateIsRestrictedToSkills(auth, true, {
            transaction,
          });
          expect(result.isOk()).toBe(true);
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(await MCPServerViewResource.fetchById(auth, view.sId)).toMatchObject(
      {
        isRestrictedToSkills: false,
      }
    );
    await expect(
      withTransaction(
        async (transaction) => {
          const result = await server.delete(auth, { transaction });
          expect(result.isOk()).toBe(true);
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await MCPServerViewResource.fetchById(auth, view.sId)
    ).not.toBeNull();
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({ tools: [view.sId] });
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({ tools: [view.sId] });
  });
});
