import { assert, describe, expect, it } from "vitest";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  getPrefixedToolName,
  getToolExtraFields,
  listToolsForServerSideMCPServer,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/mcp_actions";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { MCPConnectionParams } from "@app/lib/actions/mcp_metadata";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

// Sets up test environment with workspace, auth, MCP server, client connection, and configuration.
async function setupTest() {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  // Membership need to be set before auth.
  await MembershipFactory.associate(workspace, user, {
    role: "admin",
  });
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  // Auth user need to have admin role to create space.
  await SpaceResource.makeDefaultsForWorkspace(auth, {
    globalGroup,
    systemGroup,
  });
  const internalMCPServer = await InternalMCPServerInMemoryResource.makeNew(
    auth,
    {
      name: "google_calendar",
      useCase: null,
    }
  );

  // Set up MCP connection and configuration.
  const connectionParams: MCPConnectionParams = {
    type: "mcpServerId",
    mcpServerId: internalMCPServer.id,
    oAuthUseCase: null,
  };

  const r = await connectToMCPServer(auth, {
    params: connectionParams,
  });
  assert(r.isOk());
  const mcpClient = r.value;

  const config: ServerSideMCPServerConfigurationType = {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: "dummy_name",
    description: "dummy_description",
    dataSources: null,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "mcpServerId",
    dustAppConfiguration: null,
    internalMCPServerId: internalMCPServer.id,
    secretName: null,
  };

  return {
    auth,
    user,
    workspace,
    mcpServerId: internalMCPServer.id,
    connectionParams,
    mcpClient,
    config,
  };
}

describe("MCP Actions", () => {
  it("should filter disabled tools and store metadata settings", async () => {
    const { auth, mcpServerId, connectionParams, mcpClient, config } =
      await setupTest();
    // Test initial tool listing - should include all tools with default permissions.
    const toolsResBefore = await listToolsForServerSideMCPServer(
      auth,
      connectionParams,
      mcpClient,
      config
    );
    assert(toolsResBefore.isOk());
    expect(toolsResBefore.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          availability: "manual",
          name: "list_calendars",
          permission: "never_ask", // Default permission from MCP server.
        }),
        expect.objectContaining({
          availability: "manual",
          name: "list_events",
          permission: "never_ask", // Default permission from MCP server.
        }),
      ])
    );

    // Update tool metadata settings - disable list_calendars and change permissions.
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: mcpServerId,
      toolName: "list_calendars",
      permission: "high",
      enabled: false, // This will cause the tool to be filtered out.
    });
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: mcpServerId,
      toolName: "list_events",
      permission: "high", // Permission metadata is stored but NOT applied to tool configs.
      enabled: true, // Explicitly enable (though it's enabled by default).
    });

    // Verify metadata is stored correctly.
    const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      connectionParams.mcpServerId
    );
    expect(metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: false,
          toolName: "list_calendars",
          permission: "high",
        }),
        expect.objectContaining({
          enabled: true,
          toolName: "list_events",
          permission: "high",
        }),
      ])
    );

    // Test tool listing after metadata changes.
    const toolsResAfter = await listToolsForServerSideMCPServer(
      auth,
      connectionParams,
      mcpClient,
      config
    );
    assert(toolsResAfter.isOk());
    expect(toolsResAfter.value).toEqual(
      expect.arrayContaining([
        // Note: list_calendars is filtered out because enabled=false.
        expect.objectContaining({
          availability: "manual",
          name: "list_events",
          permission: "never_ask", // Permission metadata is stored but NOT applied to tool configs.
        }),
      ])
    );
    // Verify list_calendars is NOT in the results (filtered out due to enabled=false).
    expect(toolsResAfter.value).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "list_calendars",
        }),
      ])
    );
  });
});

describe("getPrefixedToolName", () => {
  const mockConfig: ServerSideMCPServerConfigurationType = {
    name: "Test Server",
    type: "mcp_server_configuration",
    sId: "sId1234",
    id: 1,
    description: "Test server description",
    mcpServerViewId: "test-view-id",
    dataSources: null,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
  };

  it("should correctly prefix and slugify tool names", () => {
    const result = getPrefixedToolName(mockConfig, "My Tool");
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe(`test_server${TOOL_NAME_SEPARATOR}my_tool`);
  });

  it("should correctly prefix and slugify tool names with special characters", () => {
    const result = getPrefixedToolName(mockConfig, "My Tool (123) $");
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe(`test_server${TOOL_NAME_SEPARATOR}my_tool_123_`);
  });

  it("should handle tool names that are too long for prefixing", () => {
    const longToolName = "a".repeat(60);
    const result = getPrefixedToolName(mockConfig, longToolName);
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe("a".repeat(60));
  });

  it("should handle tool names that are too long to use at all", () => {
    const extremelyLongName = "a".repeat(65);
    const result = getPrefixedToolName(mockConfig, extremelyLongName);
    expect(result.isErr()).toBe(true);
    assert(result.isErr());
    expect(result.error.message).toBe(
      `Tool name "${extremelyLongName}" is too long. Maximum length is 64 characters.`
    );
  });

  it("should truncate server name when needed", () => {
    const longServerConfig: ServerSideMCPServerConfigurationType = {
      ...mockConfig,
      name: "a".repeat(100),
    };
    const shortToolName = "tool";
    const result = getPrefixedToolName(longServerConfig, shortToolName);
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    const expectedServerNameLength =
      64 - shortToolName.length - TOOL_NAME_SEPARATOR.length;
    expect(result.value).toBe(
      `a`.repeat(expectedServerNameLength) + TOOL_NAME_SEPARATOR + shortToolName
    );
  });

  it("should handle minimum prefix length requirement", () => {
    const shortServerConfig: ServerSideMCPServerConfigurationType = {
      ...mockConfig,
      name: "ab",
    };
    const longToolName = "a".repeat(60);
    const result = getPrefixedToolName(shortServerConfig, longToolName);
    expect(result.isOk()).toBe(true);
    assert(result.isOk());
    expect(result.value).toBe("a".repeat(60));
  });
});

describe("makeToolsWithStakesAndTimeout", () => {
  it("should process internal MCP server with google_calendar", () => {
    const metadata: {
      toolName: string;
      permission: "high" | "low" | "never_ask";
      enabled: boolean;
    }[] = [
      {
        toolName: "list_calendars",
        permission: "high",
        enabled: true,
      },
    ];

    const sid = internalMCPServerNameToSId({
      name: "google_calendar",
      workspaceId: 1,
      prefix: 0,
    });
    const result = getToolExtraFields(sid, metadata);
    assert(result.isOk());
    expect(result.value).toEqual({
      toolsEnabled: {
        list_calendars: true,
      },
      toolsStakes: {
        list_calendars: "never_ask",
        list_events: "never_ask",
        get_event: "never_ask",
        create_event: "low",
        update_event: "low",
        delete_event: "low",
        check_availability: "never_ask",
      },
      serverTimeoutMs: undefined,
    });
  });

  it("should process remote MCP server", () => {
    const metadata: {
      toolName: string;
      permission: "high" | "low" | "never_ask";
      enabled: boolean;
    }[] = [
      {
        toolName: "custom_tool",
        permission: "low",
        enabled: true,
      },
      {
        toolName: "another_tool",
        permission: "high",
        enabled: true,
      },
      {
        toolName: "yet_another_tool",
        permission: "low",
        enabled: false,
      },
    ];

    const result = getToolExtraFields("rms_DzP3svIoVg", metadata);
    assert(result.isOk());
    expect(result.value).toEqual({
      toolsEnabled: {
        custom_tool: true,
        another_tool: true,
        yet_another_tool: false,
      },
      toolsStakes: {
        custom_tool: "low",
        another_tool: "high",
        yet_another_tool: "low",
      },
      toolsRetryPolicies: undefined,
      serverTimeoutMs: undefined,
    });
  });

  it("should handle errors from invalid server ID format", () => {
    // Use an invalid server ID format that will cause an error to be thrown
    const metadata: RemoteMCPServerToolMetadataResource[] = [];

    expect(() => {
      getToolExtraFields("invalid_server_id", metadata);
    }).toThrow("Invalid MCP server ID: invalid_server_id");
  });
});
