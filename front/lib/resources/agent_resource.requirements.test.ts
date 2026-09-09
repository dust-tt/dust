import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it, vi } from "vitest";

async function setup() {
  const {
    authenticator: auth,
    workspace,
    globalSpace,
  } = await createResourceTest({ role: "admin" });
  const space = await SpaceFactory.regular(workspace);
  const pod = await SpaceFactory.project(workspace);
  const skill = await SkillFactory.create(auth, {
    requestedSpaceIds: [space.id, pod.id],
    availability: "editors",
    addCurrentUserAsEditor: false,
  });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  await skill.addToAgent(auth, agent);
  const server = await RemoteMCPServerFactory.create(workspace);
  const view = await MCPServerViewFactory.create(
    workspace,
    server.sId,
    globalSpace
  );
  const action =
    await AgentActionConfigurationResource.createAgentActionConfiguration(
      auth,
      buildServerSideMCPServerConfiguration({ mcpServerView: view }),
      agent
    );
  expect(action.isOk()).toBe(true);
  const before = await AgentResource.getAgentConfiguration(auth, {
    agentId: agent.sId,
    variant: "full",
    dangerouslySkipPermissionFiltering: true,
  });
  expect(before?.actions).toHaveLength(1);
  expect(await SkillResource.fetchById(auth, skill.sId)).toBeNull();
  return {
    auth,
    workspace,
    agent,
    skill,
    before,
    spaces: [globalSpace, space, pod],
  };
}

describe("AgentResource space requirement maintenance", () => {
  it("keeps batched data-source and table requirements separate and applies ignored spaces", async () => {
    const {
      authenticator: auth,
      workspace,
      globalSpace,
    } = await createResourceTest({ role: "admin" });
    const firstSpace = await SpaceFactory.regular(workspace);
    const secondSpace = await SpaceFactory.project(workspace);
    const firstView = await DataSourceViewFactory.folder(workspace, firstSpace);
    const secondView = await DataSourceViewFactory.folder(
      workspace,
      secondSpace
    );
    const server = await RemoteMCPServerFactory.create(workspace);
    const toolView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const action = buildServerSideMCPServerConfiguration({
      mcpServerView: toolView,
    });
    expect(
      await AgentActionConfigurationResource.getSpaceRequirements(
        auth,
        [
          {
            actions: [
              {
                ...action,
                dataSources: [
                  {
                    dataSourceViewId: firstView.sId,
                    workspaceId: workspace.sId,
                    filter: { tags: null, parents: null },
                  },
                ],
              },
            ],
            skills: [],
          },
          {
            actions: [
              {
                ...action,
                tables: [
                  {
                    dataSourceViewId: secondView.sId,
                    workspaceId: workspace.sId,
                    tableId: "test-table",
                  },
                ],
              },
            ],
            skills: [],
          },
          { actions: [], skills: [] },
        ],
        { ignoreSpaces: [globalSpace] }
      )
    ).toEqual([
      { requestedSpaceIds: [firstSpace.id] },
      { requestedSpaceIds: [secondSpace.id] },
      { requestedSpaceIds: [] },
    ]);
  });

  it("includes unreadable skill spaces and pods, preserving metadata and foreign workspaces", async () => {
    const { auth, workspace, agent, before, spaces } = await setup();
    const foreign = await setup();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const expected = { total: 1, updated: 1, agentIds: [agent.sId] };
    expect(
      await AgentResource.rebuildSpaceRequirements(auth, {
        agentIds: [agent.sId, foreign.agent.sId],
        dryRun: true,
      })
    ).toEqual(expected);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({
      requested_space_ids: [],
    });
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    expect(
      await AgentResource.rebuildSpaceRequirements(auth, {
        agentIds: [agent.sId, foreign.agent.sId],
      })
    ).toEqual(expected);
    expect(
      await AgentResource.getAgentConfiguration(auth, {
        agentId: agent.sId,
        variant: "full",
        dangerouslySkipPermissionFiltering: true,
      })
    ).toEqual({
      ...before,
      requestedSpaceIds: spaces.map((space) => space.sId),
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({
      requested_space_ids: expect.arrayContaining(
        spaces.map((space) => space.sId)
      ),
    });
    expect(
      await AgentResource.getAgentConfiguration(foreign.auth, {
        agentId: foreign.agent.sId,
        variant: "full",
        dangerouslySkipPermissionFiltering: true,
      })
    ).toEqual(foreign.before);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(await AgentResource.rebuildSpaceRequirements(auth)).toEqual({
      total: 1,
      updated: 0,
      agentIds: [],
    });
  });

  it("rolls back a rebuild with its outer transaction and never starts indexation early", async () => {
    const { auth, agent, before, spaces } = await setup();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const rollback = new Error("Rollback requirement rebuild");
    await expect(
      withTransaction(
        async (transaction) => {
          expect(
            await AgentResource.rebuildSpaceRequirements(auth, { transaction })
          ).toMatchObject({ updated: 1 });
          expect(
            await AgentSearchDocumentResource.fetchSearchDocument(
              auth,
              agent.sId
            )
          ).toMatchObject({
            requested_space_ids: expect.arrayContaining(
              spaces.map((space) => space.sId)
            ),
          });
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await AgentResource.getAgentConfiguration(auth, {
        agentId: agent.sId,
        variant: "full",
        dangerouslySkipPermissionFiltering: true,
      })
    ).toEqual(before);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("requires admin access and respects active-only and logical-agent selection", async () => {
    const { authenticator: auth, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const active = await AgentConfigurationFactory.createTestAgent(auth, {
      requestedSpaceIds: [globalSpace.id],
    });
    const draft = await AgentConfigurationFactory.createTestAgent(auth, {
      status: "draft",
      requestedSpaceIds: [globalSpace.id],
    });
    expect(
      await AgentResource.rebuildSpaceRequirements(auth, {
        agentIds: [draft.sId],
        dryRun: true,
      })
    ).toEqual({
      total: 0,
      updated: 0,
      agentIds: [],
    });
    expect(
      await AgentResource.rebuildSpaceRequirements(auth, {
        agentIds: [draft.sId],
        onlyActive: false,
      })
    ).toEqual({
      total: 1,
      updated: 1,
      agentIds: [draft.sId],
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, active.sId)
    ).toMatchObject({
      requested_space_ids: [globalSpace.sId],
    });
    const member = await createResourceTest({ role: "user" });
    await expect(
      AgentResource.rebuildSpaceRequirements(member.authenticator)
    ).rejects.toThrow("Only admins");
  });
});
