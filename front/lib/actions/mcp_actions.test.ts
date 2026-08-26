import { REMOTE_MAX_STRUCTURED_CONTENT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type {
  ClientSideMCPToolConfigurationType,
  LightServerSideMCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
  ServerSideMCPToolConfigurationType,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import {
  getToolExtraFields,
  listToolsForServerSideMCPServer,
  makeServerSideMCPToolConfigurations,
  postProcessMCPToolResult,
  runToolCallWithDetachedSignal,
  tryCallMCPTool,
} from "@app/lib/actions/mcp_actions";
import {
  autoInternalMCPServerNameToSId,
  internalMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPConnectionParams } from "@app/lib/actions/mcp_metadata";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import type { ServerSideMCPToolTypeWithStakeAndRetryPolicy } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { assert, describe, expect, it, vi } from "vitest";

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
        toolContext: Parameters<typeof actual.registerTool>[1],
        server: Parameters<typeof actual.registerTool>[2],
        tool: Parameters<typeof actual.registerTool>[3],
        opts: Parameters<typeof actual.registerTool>[4]
      ) => {
        actual.registerTool(
          auth,
          toolContext,
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
        toolContext: {
          runContext: (extra as { runContext?: unknown }).runContext,
        },
      }),
  };
  const handlersWithTags = {
    ...handlers,
    [FIND_TAGS_TOOL_NAME]: (
      params: {
        query: string;
        dataSources: DataSourcesToolConfigurationType;
      },
      { auth }: { auth: Authenticator }
    ) => executeFindTags(auth, params.query, params.dataSources),
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
async function setupTest(
  options: {
    workspace?: WorkspaceType;
    serverName?: InternalMCPServerNameType;
  } = {}
) {
  const user = await UserFactory.basic();
  const workspace = options.workspace ?? (await WorkspaceFactory.basic());
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
      name: options.serverName ?? "google_calendar",
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
  it.each([
    {
      planType: "credit-priced",
      createWorkspace: () => WorkspaceFactory.creditPriced(),
      expectedStake: "low",
    },
    {
      planType: "legacy",
      createWorkspace: () => WorkspaceFactory.basic(),
      expectedStake: "high",
    },
  ])(
    "sets schedule_wakeup to $expectedStake stake for $planType plans",
    async ({ createWorkspace, expectedStake }) => {
      const workspace = await createWorkspace();
      const { auth, connectionParams, mcpClient, config } = await setupTest({
        workspace,
        serverName: "wakeups",
      });

      const toolsResult = await listToolsForServerSideMCPServer(
        auth,
        connectionParams,
        mcpClient,
        config
      );

      assert(toolsResult.isOk());
      expect(toolsResult.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "schedule_wakeup",
            permission: expectedStake,
          }),
          expect.objectContaining({
            name: "list_wakeups",
            permission: "never_ask",
          }),
          expect.objectContaining({
            name: "cancel_wakeup",
            permission: "never_ask",
          }),
        ])
      );
    }
  );

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
    // The handler also returns structuredContent, which must survive the transport round-trip.
    mockSearchFunction.mockResolvedValue(
      new Ok({
        content: [
          {
            type: "resource" as const,
            resource: {
              mimeType:
                INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
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
        ],
        structuredContent: { results: [{ id: "doc1" }], resultCount: 1 },
      })
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
        isRestrictedToSkills: false,
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
      (
        await MCPServerViewResource.create(auth, {
          systemView,
          space: systemSpace,
        })
      ).view;

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
      branchId: null,
      richMentions: [],
      costCredits: null,
      resolvedModel: null,
      modelResolutionMethod: null,
    };
    const userMessage: UserMessageType = {
      id: -1,
      created: Date.now(),
      type: "user_message",
      sId: generateRandomModelSId(),
      visibility: "visible",
      version: 0,
      rank: 0,
      branchId: null,
      user: null,
      mentions: [],
      richMentions: [],
      content: "test query",
      context: {
        username: "test",
        fullName: null,
        email: null,
        profilePictureUrl: null,
        timezone: "UTC",
        origin: "web",
      },
      reactions: [],
      requestedModel: null,
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

    const { model: agentModel, ...agentConfiguration } = agentConfig;

    // Create agent loop run context
    const agentLoopRunContext: AgentLoopRunContext = {
      contextType: "agent_loop",
      agentConfiguration,
      modelInfo: {
        endpoint: getTestStreamEndpoint(agentModel.modelId),
        ...agentModel,
      },
      agentMessage,
      conversation,
      stepContext: {
        citationsCount: 10,
        citationsOffset: 0,
        retrievalTopK: 10,
        resumeState: null,
        websearchResultCount: 0,
      },
      // The action resource is never read by tryCallMCPTool; a plain mock is enough here.
      action: mockAction as unknown as AgentMCPActionResource,
      toolConfiguration,
      userMessage,
    };

    // Call tryCallMCPTool
    const resultGenerator = tryCallMCPTool(
      auth,
      {
        query: "test query",
        relativeTimeFrame: "all",
        dataSources: [],
      },
      { runContext: agentLoopRunContext },
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

    // Verify structuredContent survived the transport round-trip.
    expect(toolCallResult.structuredContent).toEqual({
      results: [{ id: "doc1" }],
      resultCount: 1,
    });

    // Ensure the code path went through withToolResultProcessing (spy is set in wrappers mock so it's in place when search server loads).
    const withToolResultProcessingSpy = withToolResultProcessingSpyRef.current;
    expect(withToolResultProcessingSpy).not.toBeNull();
    expect(
      withToolResultProcessingSpy,
      "withToolResultProcessing was not called — tool result path may not use wrappers"
    ).toHaveBeenCalled();
  });
});

describe("postProcessMCPToolResult - structuredContent", () => {
  const clientConfig: ClientSideMCPToolConfigurationType = {
    id: -1,
    sId: "test-sid",
    type: "mcp_configuration",
    name: "test_tool",
    description: null,
    clientSideMcpServerId: "client-server-id",
    inputSchema: { type: "object", properties: {} },
    permission: "never_ask",
    toolServerId: "client-server-id",
    originalName: "test_tool",
    mcpServerName: "test_server",
  };

  type ToolCallResult = Awaited<ReturnType<Client["callTool"]>>;

  it("appends structuredContent as a text item when content is empty", () => {
    const result = postProcessMCPToolResult(
      {
        content: [],
        structuredContent: { tables: [{ id: "tbl1", name: "Bugs" }] },
      } as ToolCallResult,
      clientConfig
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ tables: [{ id: "tbl1", name: "Bugs" }] }),
    });
  });

  it("does not append structuredContent when content is non-empty", () => {
    const result = postProcessMCPToolResult(
      {
        content: [{ type: "text", text: "existing result" }],
        structuredContent: { tables: [] },
      } as ToolCallResult,
      clientConfig
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "existing result",
    });
  });

  it("leaves content empty when structuredContent is absent", () => {
    const result = postProcessMCPToolResult(
      { content: [] } as ToolCallResult,
      clientConfig
    );

    expect(result.content).toHaveLength(0);
    expect(result.structuredContent).toBeUndefined();
  });

  it("preserves structuredContent alongside non-empty content for client servers", () => {
    const result = postProcessMCPToolResult(
      {
        content: [{ type: "text", text: "existing result" }],
        structuredContent: { tables: [{ id: "tbl1" }] },
      } as ToolCallResult,
      clientConfig
    );

    expect(result.content).toEqual([{ type: "text", text: "existing result" }]);
    expect(result.structuredContent).toEqual({ tables: [{ id: "tbl1" }] });
  });

  it("preserves structuredContent when falling back to it for empty content", () => {
    const result = postProcessMCPToolResult(
      {
        content: [],
        structuredContent: { tables: [] },
      } as ToolCallResult,
      clientConfig
    );

    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ tables: [] }) },
    ]);
    expect(result.structuredContent).toEqual({ tables: [] });
  });

  const serverSideConfigBase = {
    id: -1,
    sId: "test-sid",
    type: "mcp_configuration",
    description: null,
    inputSchema: { type: "object", properties: {} },
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "msv_test",
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    availability: "manual",
    permission: "never_ask",
    toolServerId: "srv_test",
    retryPolicy: "no_retry",
  } as const;

  function makeServerSideConfig(
    internalMCPServerId: string | null
  ): ServerSideMCPToolConfigurationType {
    if (internalMCPServerId !== null) {
      return {
        ...serverSideConfigBase,
        name: "semantic_search",
        originalName: "semantic_search",
        mcpServerName: "search",
        internalMCPServerId,
      };
    }
    return {
      ...serverSideConfigBase,
      name: "test_tool",
      originalName: "test_tool",
      mcpServerName: "test_server",
      internalMCPServerId: null,
    };
  }

  it("preserves structuredContent for internal servers alongside the _meta restore", () => {
    const result = postProcessMCPToolResult(
      {
        content: [
          {
            type: "resource",
            resource: {
              uri: "test://resource",
              text: "resource text",
              _meta: { extraField: "extra" },
            },
          },
        ],
        structuredContent: { count: 3 },
      } as ToolCallResult,
      makeServerSideConfig(
        internalMCPServerNameToSId({
          name: "search",
          workspaceId: 1,
          prefix: 0,
        })
      )
    );

    expect(result.structuredContent).toEqual({ count: 3 });
    // The _meta restore of extra resource fields is unaffected.
    const [item] = result.content;
    if (item.type !== "resource") {
      throw new Error("Expected a resource item.");
    }
    // The resource type is a union without extra fields; extras restored from
    // _meta need a loose view (same pattern as the tryCallMCPTool test above).
    const restoredResource = item.resource as any;
    expect(restoredResource.extraField).toBe("extra");
    expect(restoredResource._meta).toBeUndefined();
  });

  it("preserves structuredContent for remote servers within the size limit", () => {
    const result = postProcessMCPToolResult(
      {
        content: [{ type: "text", text: "remote result" }],
        structuredContent: { items: [1, 2, 3], nextCursor: "abc" },
      } as ToolCallResult,
      makeServerSideConfig(null)
    );

    expect(result.content).toEqual([{ type: "text", text: "remote result" }]);
    expect(result.structuredContent).toEqual({
      items: [1, 2, 3],
      nextCursor: "abc",
    });
  });

  it("drops oversized structuredContent from remote servers without failing the call", () => {
    const result = postProcessMCPToolResult(
      {
        content: [{ type: "text", text: "remote result" }],
        structuredContent: {
          blob: "x".repeat(REMOTE_MAX_STRUCTURED_CONTENT_SIZE_BYTES + 1),
        },
      } as ToolCallResult,
      makeServerSideConfig(null)
    );

    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "remote result" }]);
    expect(result.structuredContent).toBeUndefined();
  });

  it("keeps oversized structuredContent for internal servers", () => {
    const result = postProcessMCPToolResult(
      {
        content: [{ type: "text", text: "internal result" }],
        structuredContent: {
          blob: "x".repeat(REMOTE_MAX_STRUCTURED_CONTENT_SIZE_BYTES + 1),
        },
      } as ToolCallResult,
      makeServerSideConfig(
        internalMCPServerNameToSId({
          name: "search",
          workspaceId: 1,
          prefix: 0,
        })
      )
    );

    expect(result.structuredContent).toBeDefined();
  });
});

// Counts active "abort" listeners on a signal by spying on add/remove. We can't
// read the listener list directly, so we track the delta ourselves.
function trackAbortListeners(signal: AbortSignal): { count: () => number } {
  let count = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  vi.spyOn(signal, "addEventListener").mockImplementation((type, ...rest) => {
    if (type === "abort") {
      count += 1;
    }
    return add(type, ...rest);
  });
  vi.spyOn(signal, "removeEventListener").mockImplementation(
    (type, ...rest) => {
      if (type === "abort") {
        count -= 1;
      }
      return remove(type, ...rest);
    }
  );
  return { count: () => count };
}

describe("runToolCallWithDetachedSignal", () => {
  it("leaves no listener on the source after the call resolves", async () => {
    const source = new AbortController().signal;
    const tracker = trackAbortListeners(source);

    const result = await runToolCallWithDetachedSignal(
      source,
      async () => "ok"
    );

    expect(result).toBe("ok");
    expect(tracker.count()).toBe(0);
  });

  it("leaves no listener on the source after the call rejects", async () => {
    const source = new AbortController().signal;
    const tracker = trackAbortListeners(source);

    await expect(
      runToolCallWithDetachedSignal(source, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(tracker.count()).toBe(0);
  });

  it("does not retain a listener even if the SDK leaks one on its signal", async () => {
    // Simulates the MCP SDK: the callee attaches an abort listener it never
    // removes. The leak must land on the throwaway signal, not on `source`.
    const source = new AbortController().signal;
    const tracker = trackAbortListeners(source);

    await runToolCallWithDetachedSignal(source, async (signal) => {
      signal.addEventListener("abort", () => {});
    });

    expect(tracker.count()).toBe(0);
  });

  it("forwards aborts from the source to the throwaway signal", async () => {
    const controller = new AbortController();

    let inner: AbortSignal | undefined;
    const pending = runToolCallWithDetachedSignal(
      controller.signal,
      async (signal) => {
        inner = signal;
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve());
        });
      }
    );

    controller.abort(new Error("cancelled"));
    await pending;

    expect(inner?.aborted).toBe(true);
    expect((inner?.reason as Error)?.message).toBe("cancelled");
  });

  it("propagates an already-aborted source immediately", async () => {
    const controller = new AbortController();
    controller.abort(new Error("already gone"));

    const seen = await runToolCallWithDetachedSignal(
      controller.signal,
      async (signal) => signal.aborted
    );

    expect(seen).toBe(true);
  });

  it("runs without a source signal", async () => {
    const seen = await runToolCallWithDetachedSignal(
      undefined,
      async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return signal.aborted;
      }
    );

    expect(seen).toBe(false);
  });
});

describe("makeServerSideMCPToolConfigurations eager flag", () => {
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
    internalMCPServerId: "internalMCPServerId",
    secretName: null,
    dustProject: null,
  };

  function makeTool(
    name: string,
    eager?: boolean
  ): ServerSideMCPToolTypeWithStakeAndRetryPolicy {
    return {
      name,
      description: `${name} description`,
      inputSchema: { type: "object", properties: {} },
      availability: "auto",
      stakeLevel: "never_ask",
      toolServerId: "toolServerId",
      retryPolicy: "no_retry",
      ...(eager ? { eager: true } : {}),
    };
  }

  it("carries eager onto the tool configuration when set", () => {
    const [tool] = makeServerSideMCPToolConfigurations(config, [
      makeTool("eager_tool", true),
    ]);

    expect(tool.eager).toBe(true);
  });

  it("omits eager when the tool does not opt in", () => {
    const [tool] = makeServerSideMCPToolConfigurations(config, [
      makeTool("plain_tool"),
    ]);

    expect(tool.eager).toBeUndefined();
  });

  it("defers exactly the non-eager tools under the Anthropic client rule", () => {
    // Mirrors the Anthropic client: defer_loading = toolSearchEnabled && !eager.
    const tools = makeServerSideMCPToolConfigurations(config, [
      makeTool("eager_tool", true),
      makeTool("plain_tool"),
    ]);

    const toolSearchEnabled = true;
    const deferred = tools
      .filter((t) => toolSearchEnabled && !t.eager)
      .map((t) => t.name);

    expect(deferred).toEqual(["plain_tool"]);
  });
});
