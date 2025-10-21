import { describe, expect, it } from "vitest";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getAgentConfigurationRequirementsFromActions } from "@app/lib/api/assistant/permissions";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

describe("getAgentConfigurationRequirementsFromActions", () => {
  it("should return empty arrays when no actions are provided", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const result = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions: [],
      }
    );

    expect(result.requestedGroupIds).toEqual([]);
    expect(result.requestedSpaceIds).toEqual([]);
  });

  it("should handle actions with data sources from different space types", async () => {
    const { authenticator, workspace, globalGroup } = await createResourceTest({
      role: "admin",
    });

    // Create a regular space with specific group permissions
    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server1",
        dustAppConfiguration: null,
        secretName: null,
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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server2",
        dustAppConfiguration: null,
        secretName: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions,
      }
    );

    // Should include space IDs from both spaces
    expect(result.requestedSpaceIds).toHaveLength(2);
    expect(result.requestedGroupIds).toHaveLength(2);

    expect(result.requestedGroupIds.flat()).toContain(globalGroup.id);
    expect(result.requestedGroupIds.flat()).toContain(
      regularSpace.groups.map((g) => g.id)[0]
    );
    expect(result.requestedGroupIds.flat()).toContain(
      regularSpace.groups.map((g) => g.id)[0]
    );
  });

  it("should handle actions with MCP server views from different spaces", async () => {
    const { authenticator, workspace, globalGroup, globalSpace } =
      await createResourceTest({ role: "admin" });

    // Create a restricted space using SpaceFactory
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(restrictedSpace, globalGroup);

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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: globalMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: restrictedMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions,
      }
    );

    // Should include space IDs from both spaces
    expect(result.requestedSpaceIds).toHaveLength(2);
    expect(result.requestedSpaceIds).toContain(globalSpace.id);
    expect(result.requestedSpaceIds).toContain(restrictedSpace.id);

    // Should include group requirements from restricted space
    expect(result.requestedGroupIds).toHaveLength(2);
    expect(result.requestedGroupIds[0]).toContain(globalGroup.id);
  });

  it("should handle ignoreSpaces parameter correctly", async () => {
    const { authenticator, workspace, globalGroup } = await createResourceTest({
      role: "admin",
    });

    // Create two spaces using SpaceFactory
    const space1 = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space1, globalGroup);

    const space2 = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space2, globalGroup);

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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server1",
        dustAppConfiguration: null,
        secretName: null,
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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "server2",
        dustAppConfiguration: null,
        secretName: null,
        internalMCPServerId: null,
      },
    ];

    // Without ignoreSpaces - should include both spaces
    const resultAll = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions,
      }
    );

    expect(resultAll.requestedSpaceIds).toHaveLength(2);
    expect(resultAll.requestedSpaceIds).toContain(space1.id);
    expect(resultAll.requestedSpaceIds).toContain(space2.id);

    // With ignoreSpaces - should exclude space1
    const resultIgnore = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions,
        ignoreSpaces: [space1],
      }
    );

    expect(resultIgnore.requestedSpaceIds).toHaveLength(1);
    expect(resultIgnore.requestedSpaceIds).toContain(space2.id);
    expect(resultIgnore.requestedSpaceIds).not.toContain(space1.id);
  });

  it("should handle mixed action types correctly", async () => {
    const { authenticator, workspace, globalGroup } = await createResourceTest({
      role: "admin",
    });

    // Create different spaces for different resource types
    const dsSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(dsSpace, globalGroup);

    const mcpSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(mcpSpace, globalGroup);

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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: mcpServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        internalMCPServerId: null,
      },
    ];

    const result = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions,
      }
    );

    // Should include both space IDs
    expect(result.requestedSpaceIds).toHaveLength(2);
    expect(result.requestedSpaceIds).toContain(dsSpace.id);
    expect(result.requestedSpaceIds).toContain(mcpSpace.id);

    // Should include group requirements from both spaces
    expect(result.requestedGroupIds).toHaveLength(2);
    expect(result.requestedGroupIds[0]).toContain(globalGroup.id);
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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: autoMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        internalMCPServerId: internalAutoServer.id,
      },
    ];

    const autoOnlyResult = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions: autoOnlyActions,
      }
    );

    // Should NOT include any spaces or groups since auto tools are automatically available
    expect(autoOnlyResult.requestedSpaceIds).toHaveLength(0);
    expect(autoOnlyResult.requestedGroupIds).toHaveLength(0);

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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: autoMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
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
        reasoningModel: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: regularMCPServerView.sId,
        dustAppConfiguration: null,
        secretName: null,
        internalMCPServerId: null,
      },
    ];

    const mixedResult = await getAgentConfigurationRequirementsFromActions(
      authenticator,
      {
        actions: mixedActions,
      }
    );

    // Should only include the regular space, not the auto tool space
    expect(mixedResult.requestedSpaceIds).toHaveLength(1);
    expect(mixedResult.requestedSpaceIds).toContain(regularSpace.id);
    expect(mixedResult.requestedSpaceIds).not.toContain(globalSpace.id);
  });
});
