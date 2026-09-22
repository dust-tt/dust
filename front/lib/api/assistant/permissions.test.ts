import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

describe("getAgentConfigurationRequirementsFromCapabilities", () => {
  it("should return only the global space when no actions are provided", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions: [],
        skills: [],
      }
    );

    expect(result.requestedSpaceIds).toEqual([globalSpace.id]);
  });

  it("should handle actions with data sources from different space types", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({
        role: "admin",
      });

    // Create a regular space with specific group permissions
    const regularSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(regularSpace, globalGroup);

    // Create a public space
    const publicSpace = await SpaceFactory.regular(workspace); // Using regular as proxy for now

    // Create data source views using factory
    const regularDsView = await DataSourceViewFactory.folder(
      workspace,
      regularSpace
    );
    const publicDsView = await DataSourceViewFactory.folder(
      workspace,
      publicSpace
    );

    // Create MCP server configurations that use these data sources
    const actions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "action1",
        type: "mcp_server_configuration",
        name: "Action with Regular DS",
        description: null,
        dataSources: [
          {
            dataSourceViewId: regularDsView.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server1",
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
      {
        id: 2,
        sId: "action2",
        type: "mcp_server_configuration",
        name: "Action with Public DS",
        description: null,
        dataSources: [
          {
            dataSourceViewId: publicDsView.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server2",
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions,
        skills: [],
      }
    );

    // Should include space IDs from both spaces, plus the global space.
    expect(result.requestedSpaceIds).toHaveLength(3);
    expect(result.requestedSpaceIds).toContain(regularSpace.id);
    expect(result.requestedSpaceIds).toContain(publicSpace.id);
    expect(result.requestedSpaceIds).toContain(globalSpace.id);
  });

  it("adds the Pod space of a dustProject configuration", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions: [
          {
            type: "mcp_server_configuration",
            name: "Pod action",
            description: null,
            dataSources: null,
            tables: null,
            childAgentId: null,
            timeFrame: null,
            jsonSchema: null,
            additionalConfiguration: {},
            mcpServerViewId: "server1",
            dustAppConfiguration: null,
            secretName: null,
            dustProject: { projectId: pod.sId, workspaceId: workspace.sId },
          },
        ],
        skills: [],
      }
    );

    expect(result.requestedSpaceIds).toEqual([pod.id, globalSpace.id]);
  });

  it("ignores a Pod id that aliases a space through another prefix", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const aliasedSpace = await SpaceFactory.regular(workspace);

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions: [
          {
            type: "mcp_server_configuration",
            name: "Pod action",
            description: null,
            dataSources: null,
            tables: null,
            childAgentId: null,
            timeFrame: null,
            jsonSchema: null,
            additionalConfiguration: {},
            mcpServerViewId: "server1",
            dustAppConfiguration: null,
            secretName: null,
            dustProject: {
              projectId: makeSId("data_source_view", {
                id: aliasedSpace.id,
                workspaceId: workspace.id,
              }),
              workspaceId: workspace.sId,
            },
          },
        ],
        skills: [],
      }
    );

    expect(result.requestedSpaceIds).toEqual([globalSpace.id]);
  });

  it("should handle actions with MCP server views from different spaces", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({ role: "admin" });

    // Create a restricted space using SpaceFactory
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(restrictedSpace, globalGroup);

    // Create MCP servers first, then their views in different spaces
    const globalMCPServer = await RemoteMCPServerFactory.create(workspace);
    const globalMCPServerView = await MCPServerViewFactory.create(
      workspace,
      globalMCPServer.sId,
      globalSpace
    );

    const restrictedMCPServer = await RemoteMCPServerFactory.create(workspace);
    const restrictedMCPServerView = await MCPServerViewFactory.create(
      workspace,
      restrictedMCPServer.sId,
      restrictedSpace
    );

    const actions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "action1",
        type: "mcp_server_configuration",
        name: "Global MCP Action",
        description: null,
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: globalMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
      {
        id: 2,
        sId: "action2",
        type: "mcp_server_configuration",
        name: "Restricted MCP Action",
        description: null,
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: restrictedMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions,
        skills: [],
      }
    );

    // Should include space IDs from both spaces
    expect(result.requestedSpaceIds).toHaveLength(2);
    expect(result.requestedSpaceIds).toContain(globalSpace.id);
    expect(result.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("should handle ignoreSpaces parameter correctly", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({
        role: "admin",
      });

    // Create two spaces using SpaceFactory
    const space1 = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(space1, globalGroup);

    const space2 = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(space2, globalGroup);

    // Create data source views in both spaces
    const dsView1 = await DataSourceViewFactory.folder(workspace, space1);
    const dsView2 = await DataSourceViewFactory.folder(workspace, space2);

    const actions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "action1",
        type: "mcp_server_configuration",
        name: "Action 1",
        description: null,
        dataSources: [
          {
            dataSourceViewId: dsView1.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server1",
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
      {
        id: 2,
        sId: "action2",
        type: "mcp_server_configuration",
        name: "Action 2",
        description: null,
        dataSources: [
          {
            dataSourceViewId: dsView2.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server2",
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
    ];

    // Without ignoreSpaces - should include both spaces
    const resultAll = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions,
        skills: [],
      }
    );

    expect(resultAll.requestedSpaceIds).toHaveLength(3);
    expect(resultAll.requestedSpaceIds).toContain(space1.id);
    expect(resultAll.requestedSpaceIds).toContain(space2.id);
    expect(resultAll.requestedSpaceIds).toContain(globalSpace.id);

    // With ignoreSpaces - should exclude space1
    const resultIgnore =
      await getAgentConfigurationRequirementsFromCapabilities(authenticator, {
        actions,
        skills: [],
        ignoreSpaces: [space1],
      });

    expect(resultIgnore.requestedSpaceIds).toHaveLength(2);
    expect(resultIgnore.requestedSpaceIds).toContain(space2.id);
    expect(resultIgnore.requestedSpaceIds).toContain(globalSpace.id);
    expect(resultIgnore.requestedSpaceIds).not.toContain(space1.id);
  });

  it("should handle mixed action types correctly", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({
        role: "admin",
      });

    // Create different spaces for different resource types
    const dsSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(dsSpace, globalGroup);

    const mcpSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(mcpSpace, globalGroup);

    // Create resources in each space
    const dsView = await DataSourceViewFactory.folder(workspace, dsSpace);
    const mcpServer = await RemoteMCPServerFactory.create(workspace);
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      mcpServer.sId,
      mcpSpace
    );

    // Create action that uses both types
    const actions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "mixed-action",
        type: "mcp_server_configuration",
        name: "Mixed Action",
        description: null,
        dataSources: [
          {
            dataSourceViewId: dsView.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: mcpServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions,
        skills: [],
      }
    );

    // Should include both space IDs, plus the global space.
    expect(result.requestedSpaceIds).toHaveLength(3);
    expect(result.requestedSpaceIds).toContain(dsSpace.id);
    expect(result.requestedSpaceIds).toContain(mcpSpace.id);
    expect(result.requestedSpaceIds).toContain(globalSpace.id);
  });

  it("should handle internal MCP servers with auto availability correctly", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });

    // Create an internal MCP server with "auto" availability (like search)
    const internalAutoServer = await InternalMCPServerInMemoryResource.makeNew(
      authenticator,
      {
        name: "search", // This has "auto" availability according to constants test
        useCase: null,
      }
    );

    // Create a regular space for comparison
    const regularSpace = await SpaceFactory.regular(workspace);

    // Create MCP server views - one for internal auto server, one for regular space
    const autoMCPServerView = await MCPServerViewFactory.create(
      workspace,
      internalAutoServer.id,
      globalSpace
    );

    const regularMCPServer = await RemoteMCPServerFactory.create(workspace);
    const regularMCPServerView = await MCPServerViewFactory.create(
      workspace,
      regularMCPServer.sId,
      regularSpace
    );

    // Test 1: Action with only auto internal server - should not require any spaces/groups
    const autoOnlyActions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "auto-internal-action",
        type: "mcp_server_configuration",
        name: "Auto Internal Action",
        description: null,
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: autoMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: internalAutoServer.id,
      },
    ];

    const autoOnlyResult =
      await getAgentConfigurationRequirementsFromCapabilities(authenticator, {
        actions: autoOnlyActions,
        skills: [],
      });

    // Auto tools are automatically available, so they add nothing beyond the global space.
    expect(autoOnlyResult.requestedSpaceIds).toEqual([globalSpace.id]);

    // Test 2: Mixed action with both auto and regular server
    const mixedActions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "mixed-action",
        type: "mcp_server_configuration",
        name: "Mixed Action",
        description: null,
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: autoMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: internalAutoServer.id,
      },
      {
        id: 2,
        sId: "regular-action",
        type: "mcp_server_configuration",
        name: "Regular Action",
        description: null,
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: regularMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
    ];

    const mixedResult = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions: mixedActions,
        skills: [],
      }
    );

    // The auto tool adds nothing: only the regular space on top of the global space.
    expect(mixedResult.requestedSpaceIds).toHaveLength(2);
    expect(mixedResult.requestedSpaceIds).toContain(regularSpace.id);
    expect(mixedResult.requestedSpaceIds).toContain(globalSpace.id);
  });

  it("should include skill space requirements", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({
        role: "admin",
      });

    // Create spaces for the skill requirements
    const skillSpace1 = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(skillSpace1, globalGroup);

    const skillSpace2 = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(skillSpace2, globalGroup);

    // Create a skill with space requirements
    const skill = await SkillFactory.create(authenticator, {
      name: "Skill with space requirements",
      requestedSpaceIds: [skillSpace1.id, skillSpace2.id],
    });

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions: [],
        skills: [skill],
      }
    );

    expect(result.requestedSpaceIds).toHaveLength(3);
    expect(result.requestedSpaceIds).toContain(skillSpace1.id);
    expect(result.requestedSpaceIds).toContain(skillSpace2.id);
    expect(result.requestedSpaceIds).toContain(globalSpace.id);
  });

  it("should combine skill and action space requirements without duplicates", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({
        role: "admin",
      });

    // Create a shared space used by both action and skill
    const sharedSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(sharedSpace, globalGroup);

    // Create an action-only space
    const actionSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(actionSpace, globalGroup);

    // Create a skill-only space
    const skillSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(skillSpace, globalGroup);

    // Create data source view in shared and action spaces
    const sharedDsView = await DataSourceViewFactory.folder(
      workspace,
      sharedSpace
    );
    const actionDsView = await DataSourceViewFactory.folder(
      workspace,
      actionSpace
    );

    // Create skill with shared and skill-only space requirements
    const skill = await SkillFactory.create(authenticator, {
      name: "Skill with mixed spaces",
      requestedSpaceIds: [sharedSpace.id, skillSpace.id],
    });

    const actions: ServerSideMCPServerConfigurationType[] = [
      {
        id: 1,
        sId: "action1",
        type: "mcp_server_configuration",
        name: "Action with shared DS",
        description: null,
        dataSources: [
          {
            dataSourceViewId: sharedDsView.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server1",
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
      {
        id: 2,
        sId: "action2",
        type: "mcp_server_configuration",
        name: "Action with action-only DS",
        description: null,
        dataSources: [
          {
            dataSourceViewId: actionDsView.sId,
            workspaceId: workspace.sId,
            filter: { tags: null, parents: null },
          },
        ],
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server2",
        dustAppConfiguration: null,
        secretName: null,
        dustProject: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromCapabilities(
      authenticator,
      {
        actions,
        skills: [skill],
      }
    );

    // Should include all 3 spaces without duplicates (shared appears in both action and skill),
    // plus the global space.
    expect(result.requestedSpaceIds).toHaveLength(4);
    expect(result.requestedSpaceIds).toContain(sharedSpace.id);
    expect(result.requestedSpaceIds).toContain(actionSpace.id);
    expect(result.requestedSpaceIds).toContain(skillSpace.id);
    expect(result.requestedSpaceIds).toContain(globalSpace.id);
  });
});
