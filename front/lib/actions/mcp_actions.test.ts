// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { assert, describe, expect, it, vi } from "vitest";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type {
  LightServerSideMCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import {
  getPrefixedToolName,
  getToolExtraFields,
  listToolsForServerSideMCPServer,
  tryCallMCPTool,
} from "@app/lib/actions/mcp_actions";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { MCPConnectionParams } from "@app/lib/actions/mcp_metadata";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";

// Mock Temporal activity context and heartbeat
vi.mock("@temporalio/activity", () => ({
  Context: {
    current: vi.fn(() => ({
      info: { attempt: 1 },
      cancellationSignal: { aborted: false },
    })),
  },
  heartbeat: vi.fn(),
}));

// Mock the searchFunction to return extra properties
// This must be at the top level, before any imports that use it
const { mockSearchFunction } = vi.hoisted(() => {
  return {
    mockSearchFunction: vi.fn(),
  };
});

// Spy ref so we can assert withToolResultProcessing was called. Must be set in a mock
// that runs when wrappers is first loaded (search server loads at test file load time).
const { withToolResultProcessingSpyRef } = vi.hoisted(() => ({
  withToolResultProcessingSpyRef: {
    current: null as ReturnType<typeof vi.fn> | null,
  },
}));

vi.mock(
  "@app/lib/actions/mcp_internal_actions/wrappers",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports
        typeof import("@app/lib/actions/mcp_internal_actions/wrappers")
      >();
    const spy = vi.fn(actual.withToolResultProcessing);
    withToolResultProcessingSpyRef.current = spy;
    // registerTool closes over the original withToolResultProcessing, so we must inject the spy
    // by wrapping registerTool to pass tool handlers through the spy.
    return {
      ...actual,
      withToolResultProcessing: spy,
      registerTool: (
        auth: Parameters<typeof actual.registerTool>[0],
        agentLoopContext: Parameters<typeof actual.registerTool>[1],
        server: Parameters<typeof actual.registerTool>[2],
        tool: Parameters<typeof actual.registerTool>[3],
        opts: Parameters<typeof actual.registerTool>[4]
      ) => {
        actual.registerTool(
          auth,
          agentLoopContext,
          server,
          {
            ...tool,
            handler: (params, extra) => spy(tool.handler(params, extra)),
          },
          opts
        );
      },
    };
  }
);

vi.mock("@app/lib/api/actions/servers/search/tools", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/actions/servers/search/tools"
  );
  const { buildTools } = await import(
    "@app/lib/actions/mcp_internal_actions/tool_definition"
  );
  const {
    SEARCH_TOOL_METADATA_WITH_TAGS,
    SEARCH_TOOLS_METADATA,
    SEARCH_TOOL_NAME,
  } = await import("@app/lib/api/actions/servers/search/metadata");
  const { executeFindTags } = await import(
    "@app/lib/api/actions/tools/find_tags"
  );
  const { FIND_TAGS_TOOL_NAME } = await import(
    "@app/lib/api/actions/tools/find_tags/metadata"
  );

  // Rebuild handlers so they call mockSearchFunction (the real handlers close
  // over the real searchFunction, so replacing only the export doesn't work).
  const handlers = {
    [SEARCH_TOOL_NAME]: (params: unknown, extra: unknown) =>
      mockSearchFunction({
        ...(params as object),
        auth: (extra as { auth?: unknown }).auth,
        agentLoopContext: (extra as { agentLoopContext?: unknown })
          .agentLoopContext,
      }),
  };
  const handlersWithTags = {
    ...handlers,
    [FIND_TAGS_TOOL_NAME]: (
      params: { query: string; dataSources: unknown[] },
      extra: { auth?: Authenticator }
    ) =>
      executeFindTags(
        params.query,
        params.dataSources as Parameters<typeof executeFindTags>[1],
        extra.auth
      ),
  };

  return {
    ...actual,
    searchFunction: mockSearchFunction,
    TOOLS_WITHOUT_TAGS: buildTools(SEARCH_TOOLS_METADATA, handlers as never),
    TOOLS_WITH_TAGS: buildTools(
      SEARCH_TOOL_METADATA_WITH_TAGS,
      handlersWithTags as never
    ),
  };
});

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
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "mcpServerId",
    dustAppConfiguration: null,
    internalMCPServerId: internalMCPServer.id,
    secretName: null,
    dustProject: null,
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
      permission: "high",
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
          permission: "high",
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
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
    dustProject: null,
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
      permission: MCPToolStakeLevelType;
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
        list_calendars: "high",
        list_events: "never_ask",
        get_event: "never_ask",
        create_event: "medium",
        update_event: "medium",
        delete_event: "medium",
        check_availability: "never_ask",
        get_user_timezones: "never_ask",
      },
      toolsRetryPolicies: undefined,
      serverTimeoutMs: undefined,
      toolsArgumentsRequiringApproval: {
        create_event: ["calendarId"],
        update_event: ["calendarId"],
        delete_event: ["calendarId"],
      },
    });
  });

  it("should process remote MCP server", () => {
    const metadata: {
      toolName: string;
      permission: MCPToolStakeLevelType;
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
      toolsArgumentsRequiringApproval: undefined,
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

describe("tryCallMCPTool", () => {
  it("should preserve extra properties from internal MCP server tool results", async () => {
    // The in-memory transport strips extra properties from tool results (like the real MCP SDK).
    // withToolResultProcessing (in wrappers) moves extras to _meta before the result goes over
    // the transport, so they survive; tryCallMCPTool then moves _meta back to root.
    mockSearchFunction.mockResolvedValue(
      new Ok([
        {
          type: "resource" as const,
          resource: {
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
            uri: "https://example.com/doc1",
            text: "Document 1",
            id: "doc1",
            ref: "ref1",
            chunks: ["chunk1", "chunk2"],
            source: {
              provider: "slack",
              data_source_id: "ds1",
              data_source_view_id: "dsv1",
            },
            tags: ["tag1"],
            customProperty: "customValue",
            anotherExtraProperty: 123,
          },
        },
      ])
    );
    const user = await UserFactory.basic();
    const workspace = await WorkspaceFactory.basic();
    await MembershipFactory.associate(workspace, user, {
      role: "admin",
    });
    const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceResource.makeDefaultsForWorkspace(auth, {
      globalGroup,
      systemGroup,
    });

    // Create search MCP server
    const internalMCPServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      {
        name: "search",
        useCase: null,
      }
    );

    // Create MCPServerViewResource for the internal server
    // Fetch the system space
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    const mcpServerId = autoInternalMCPServerNameToSId({
      name: "search",
      workspaceId: workspace.id,
    });

    // Get or create the system view
    let systemView = await MCPServerViewResource.getMCPServerViewForSystemSpace(
      auth,
      mcpServerId
    );

    if (!systemView) {
      // Create system view if it doesn't exist using MCPServerViewModel directly
      const { MCPServerViewModel } = await import(
        "@app/lib/models/agent/actions/mcp_server_view"
      );
      const systemViewModel = await MCPServerViewModel.create({
        workspaceId: workspace.id,
        serverType: "internal",
        internalMCPServerId: mcpServerId,
        vaultId: systemSpace.id,
        editedAt: new Date(),
        editedByUserId: auth.user()?.id ?? null,
        oAuthUseCase: null,
      });
      systemView = new MCPServerViewResource(
        MCPServerViewModel,
        systemViewModel.get(),
        systemSpace
      );
    }

    // Check if a view already exists for this space
    const existingViews = await MCPServerViewResource.listByMCPServer(
      auth,
      mcpServerId
    );
    const existingView = existingViews.find(
      (v) => v.vaultId === systemSpace.id
    );

    const mcpServerView =
      existingView ??
      (await MCPServerViewResource.create(auth, {
        systemView,
        space: systemSpace,
      }));

    // Create agent configuration and conversation
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Fetch the existing agent message from the conversation
    // The conversation.create already created messages at rank 0 (user) and rank 1 (agent)
    const messageRow = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        rank: 1, // Agent message is at rank 1
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
        },
      ],
    });
    assert(messageRow && messageRow.agentMessage);

    // Create AgentMessageType from the fetched data
    const agentMessage: AgentMessageType = {
      id: messageRow.id,
      agentMessageId: messageRow.agentMessage.id,
      created: messageRow.agentMessage.createdAt.getTime(),
      completedTs: null,
      sId: messageRow.sId,
      type: "agent_message",
      visibility: messageRow.visibility,
      version: messageRow.version,
      parentMessageId: "",
      parentAgentMessageId: null,
      status: messageRow.agentMessage.status,
      content: null,
      chainOfThought: null,
      error: null,
      configuration: agentConfig,
      skipToolsValidation: false,
      actions: [],
      contents: [],
      reactions: [],
      modelInteractionDurationMs: null,
      completionDurationMs: null,
      rank: messageRow.rank,
      richMentions: [],
    };

    // Create tool configuration
    const toolConfiguration: LightServerSideMCPToolConfigurationType = {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "search",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: mcpServerView.sId,
      dustAppConfiguration: null,
      internalMCPServerId: internalMCPServer.id,
      secretName: null,
      dustProject: null,
      originalName: "semantic_search",
      mcpServerName: "search",
      availability: "auto",
      permission: "never_ask",
      toolServerId: internalMCPServer.id,
      retryPolicy: "retry_on_interrupt",
      timeoutMs: undefined,
    };

    // Create agent loop run context
    const agentLoopRunContext: AgentLoopRunContextType = {
      agentConfiguration: agentConfig,
      agentMessage,
      conversation,
      stepContext: {
        citationsCount: 10,
        citationsOffset: 0,
        retrievalTopK: 10,
        resumeState: null,
        websearchResultCount: 0,
      },
      toolConfiguration,
    };

    // Create a mock action for the notification event
    const mockAction: AgentMCPActionWithOutputType = {
      id: agentMessage.agentMessageId as number, // Use the agentMessageId as the action id
      sId: generateRandomModelSId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agentMessageId: agentMessage.agentMessageId as number,
      internalMCPServerName: "search",
      toolName: "semantic_search",
      mcpServerId: internalMCPServer.id,
      functionCallName: "semantic_search",
      functionCallId: generateRandomModelSId(),
      params: {
        query: "test query",
        relativeTimeFrame: "all",
        dataSources: [],
      },
      citationsAllocated: 0,
      status: "running",
      step: 0,
      executionDurationMs: null,
      displayLabels: null,
      output: null,
      generatedFiles: [],
    };

    // Call tryCallMCPTool
    const resultGenerator = tryCallMCPTool(
      auth,
      {
        query: "test query",
        relativeTimeFrame: "all",
        dataSources: [],
      },
      agentLoopRunContext,
      {
        progressToken: agentMessage.agentMessageId as number,
        makeToolNotificationEvent: async () => ({
          type: "tool_notification",
          created: Date.now(),
          configurationId: agentConfig.sId,
          conversationId: conversation.sId,
          messageId: agentMessage.sId,
          action: mockAction,
          notification: {
            progress: 0,
            total: 100,
            progressToken: generateRandomModelSId(),
            _meta: {
              data: {
                label: "Test",
                output: {
                  type: "text",
                  text: "Test notification",
                },
              },
            },
          },
        }),
      }
    );

    // Collect all yielded notifications and get the return value
    const notifications: ToolNotificationEvent[] = [];
    let result = await resultGenerator.next();
    while (!result.done) {
      notifications.push(result.value);
      result = await resultGenerator.next();
    }
    // result.value is the CallToolResult return value
    const toolCallResult = result.value;
    assert(toolCallResult);
    if (toolCallResult.isError) {
      console.error(
        "Tool call error:",
        JSON.stringify(toolCallResult.content, null, 2)
      );
      throw new Error("Tool call failed");
    }
    expect(toolCallResult.isError).toBe(false);
    expect(toolCallResult.content).toHaveLength(1);

    const resourceItem = toolCallResult.content[0];
    assert(resourceItem.type === "resource");

    // Type assertion for extra properties that are added back from _meta
    // The resource type is a union, so we assert it has text (not blob) and extra properties

    const resource = resourceItem.resource as any;

    // Verify standard properties are present
    expect(resource.mimeType).toBe(
      INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT
    );
    expect(resource.uri).toBe("https://example.com/doc1");
    expect(resource.text).toBe("Document 1");

    // Verify extra properties are preserved (moved back from _meta)
    expect(resource.id).toBe("doc1");
    expect(resource.ref).toBe("ref1");
    expect(resource.chunks).toEqual(["chunk1", "chunk2"]);
    expect(resource.source).toEqual({
      provider: "slack",
      data_source_id: "ds1",
      data_source_view_id: "dsv1",
    });
    expect(resource.tags).toEqual(["tag1"]);

    // Verify additional extra properties are preserved
    expect(resource.customProperty).toBe("customValue");
    expect(resource.anotherExtraProperty).toBe(123);

    // Verify _meta is removed (properties moved back to root)
    expect(resource._meta).toBeUndefined();

    // Ensure the code path went through withToolResultProcessing (spy is set in wrappers mock so it's in place when search server loads).
    const withToolResultProcessingSpy = withToolResultProcessingSpyRef.current;
    expect(withToolResultProcessingSpy).not.toBeNull();
    expect(
      withToolResultProcessingSpy,
      "withToolResultProcessing was not called — tool result path may not use wrappers"
    ).toHaveBeenCalled();
  });
});
