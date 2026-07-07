import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp_schemas";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/api/llm/clients/anthropic/types";
import {
  buildBaseSpecifications,
  buildSpecificationsWithReplayPlaceholders,
} from "@app/temporal/agent_loop/lib/run_model";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

function makeSpecification(
  name: string,
  { eager }: { eager?: boolean } = {}
): AgentActionSpecification {
  return {
    name,
    description: `Description of ${name}`,
    inputSchema: { type: "object", properties: {}, required: [] },
    ...(eager !== undefined ? { eager } : {}),
  };
}

function assistantMessageWithFunctionCalls(
  toolNames: string[]
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "assistant",
    name: "agent",
    contents: toolNames.map((name, i) => ({
      type: "function_call",
      value: { id: `call_${i}`, name, arguments: "{}" },
    })),
  };
}

function assistantMessageWithToolSearchResult(
  toolNames: string[]
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "assistant",
    name: "agent",
    contents: [
      {
        type: "provider_passthrough",
        value: {
          provider: ANTHROPIC_PROVIDER_ID,
          block: {
            type: "tool_search_tool_result",
            tool_use_id: "srvtoolu_test",
            content: {
              type: "tool_search_tool_search_result",
              tool_references: toolNames.map((name) => ({
                type: "tool_reference",
                tool_name: name,
              })),
            },
          },
        },
      },
    ],
  };
}

function makeConversation(
  messages: ModelMessageTypeMultiActionsWithoutContentFragment[]
): ModelConversationTypeMultiActions {
  return { messages };
}

function makeServerSideToolConfiguration(
  name: string,
  {
    mcpServerViewId,
    serverConfigurationModelId = -1,
    eager,
  }: {
    mcpServerViewId: string;
    // Persisted id of the originating server configuration; -1 for
    // runtime-built servers (JIT, skills).
    serverConfigurationModelId?: number;
    eager?: boolean;
  }
): MCPToolConfigurationType {
  return {
    id: serverConfigurationModelId,
    sId: `tool_${name}`,
    type: "mcp_configuration",
    name,
    description: `Description of ${name}`,
    inputSchema: { type: "object", properties: {}, required: [] },
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId,
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    internalMCPServerId: null,
    originalName: name,
    mcpServerName: "server",
    availability: "manual",
    permission: "never_ask",
    toolServerId: "server_id",
    retryPolicy: "no_retry",
    ...(eager !== undefined ? { eager } : {}),
  };
}

function makeClientSideToolConfiguration(
  name: string
): MCPToolConfigurationType {
  return {
    id: -1,
    sId: `tool_${name}`,
    type: "mcp_configuration",
    name,
    description: `Description of ${name}`,
    inputSchema: { type: "object", properties: {}, required: [] },
    clientSideMcpServerId: "client_side_server_id",
    originalName: name,
    mcpServerName: "server",
    permission: "never_ask",
    toolServerId: "server_id",
  };
}

function makeAgentServerConfiguration({
  mcpServerViewId,
  serverConfigurationModelId,
}: {
  mcpServerViewId: string;
  serverConfigurationModelId: number;
}): ServerSideMCPServerConfigurationType {
  return {
    id: serverConfigurationModelId,
    sId: `action_${mcpServerViewId}`,
    type: "mcp_server_configuration",
    name: "server",
    description: null,
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId,
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    internalMCPServerId: null,
  };
}

describe("buildBaseSpecifications", () => {
  it("marks a custom agent's configured tools eager", () => {
    const specifications = buildBaseSpecifications(
      [
        makeServerSideToolConfiguration("configured_tool", {
          mcpServerViewId: "view_configured",
          serverConfigurationModelId: 100,
        }),
        makeServerSideToolConfiguration("jit_tool", {
          mcpServerViewId: "view_jit",
        }),
      ],
      {
        sId: "custom_agent",
        actions: [
          makeAgentServerConfiguration({
            mcpServerViewId: "view_configured",
            serverConfigurationModelId: 100,
          }),
        ],
      }
    );

    expect(
      specifications.find((s) => s.name === "configured_tool")?.eager
    ).toBe(true);
    expect(
      specifications.find((s) => s.name === "jit_tool")?.eager
    ).toBeUndefined();
  });

  it("does not promote JIT tools that share a server view with configured actions", () => {
    // Two configured actions can be instances of the same internal server and
    // therefore share one server view (e.g. two query_tables actions), and the
    // attachment-driven JIT query tables server reuses that same view. Only the
    // configured tools, identified by their persisted configuration id, may be
    // promoted; the JIT tool must stay deferred even though its view matches.
    const specifications = buildBaseSpecifications(
      [
        makeServerSideToolConfiguration("glossary__execute_database_query", {
          mcpServerViewId: "view_shared",
          serverConfigurationModelId: 100,
        }),
        makeServerSideToolConfiguration(
          "translations__execute_database_query",
          {
            mcpServerViewId: "view_shared",
            serverConfigurationModelId: 101,
          }
        ),
        makeServerSideToolConfiguration(
          "query_conversation_tables__execute_database_query",
          {
            mcpServerViewId: "view_shared",
          }
        ),
      ],
      {
        sId: "custom_agent",
        actions: [
          makeAgentServerConfiguration({
            mcpServerViewId: "view_shared",
            serverConfigurationModelId: 100,
          }),
          makeAgentServerConfiguration({
            mcpServerViewId: "view_shared",
            serverConfigurationModelId: 101,
          }),
        ],
      }
    );

    expect(
      specifications.find((s) => s.name === "glossary__execute_database_query")
        ?.eager
    ).toBe(true);
    expect(
      specifications.find(
        (s) => s.name === "translations__execute_database_query"
      )?.eager
    ).toBe(true);
    expect(
      specifications.find(
        (s) => s.name === "query_conversation_tables__execute_database_query"
      )?.eager
    ).toBeUndefined();
  });

  it("does not promote configured tools of a global agent", () => {
    const specifications = buildBaseSpecifications(
      [
        makeServerSideToolConfiguration("configured_tool", {
          mcpServerViewId: "view_configured",
          serverConfigurationModelId: 100,
        }),
      ],
      {
        sId: "dust",
        actions: [
          makeAgentServerConfiguration({
            mcpServerViewId: "view_configured",
            serverConfigurationModelId: 100,
          }),
        ],
      }
    );

    expect(specifications[0].eager).toBeUndefined();
  });

  it("preserves the intrinsic eager flag on non-configured tools", () => {
    const specifications = buildBaseSpecifications(
      [
        makeServerSideToolConfiguration("hot_jit_tool", {
          mcpServerViewId: "view_jit",
          eager: true,
        }),
      ],
      { sId: "custom_agent", actions: [] }
    );

    expect(specifications[0].eager).toBe(true);
  });

  it("keeps skill tools deferred when a skill is enabled mid-conversation", () => {
    const agentConfiguration = {
      sId: "custom_agent",
      actions: [
        makeAgentServerConfiguration({
          mcpServerViewId: "view_configured",
          serverConfigurationModelId: 100,
        }),
      ],
    };
    const configuredTool = makeServerSideToolConfiguration("configured_tool", {
      mcpServerViewId: "view_configured",
      serverConfigurationModelId: 100,
    });

    // Before the skill is enabled, its tools are not in the request at all.
    const before = buildBaseSpecifications(
      [configuredTool],
      agentConfiguration
    );
    expect(before.map((s) => s.name)).toEqual(["configured_tool"]);

    // Once enabled, the skill's server is appended to the available actions
    // without touching the agent's configured set: its tools must stay
    // deferred so the cached tool prefix is not rewritten.
    const after = buildBaseSpecifications(
      [
        configuredTool,
        makeServerSideToolConfiguration("skill_tool", {
          mcpServerViewId: "view_skill",
        }),
      ],
      agentConfiguration
    );

    expect(after.find((s) => s.name === "skill_tool")?.eager).toBeUndefined();
    expect(after.find((s) => s.name === "configured_tool")?.eager).toBe(true);
  });

  it("keeps client-side tools deferred for custom agents", () => {
    const specifications = buildBaseSpecifications(
      [makeClientSideToolConfiguration("client_tool")],
      { sId: "custom_agent", actions: [] }
    );

    expect(specifications[0].eager).toBeUndefined();
  });
});

describe("buildSpecificationsWithReplayPlaceholders", () => {
  it("does not eagerly load replayed tools that are still configured", () => {
    const baseSpecifications = [
      makeSpecification("get_weather"),
      makeSpecification("search_files"),
    ];
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["get_weather"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(specifications).toEqual(baseSpecifications);
    expect(missingReplayedToolNames).toEqual([]);
  });

  it("preserves the intrinsic eager flag of replayed tools", () => {
    const baseSpecifications = [
      makeSpecification("enable_skill", { eager: true }),
    ];
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["enable_skill"]),
    ]);

    const { specifications } = buildSpecificationsWithReplayPlaceholders(
      baseSpecifications,
      conversation
    );

    expect(specifications[0].eager).toBe(true);
  });

  it("appends a non-eager placeholder for replayed tools no longer configured", () => {
    const baseSpecifications = [makeSpecification("get_weather")];
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["removed_tool"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(missingReplayedToolNames).toEqual(["removed_tool"]);
    expect(specifications).toHaveLength(2);
    const placeholder = specifications[1];
    expect(placeholder.name).toBe("removed_tool");
    expect(placeholder.eager).toBeUndefined();
  });

  it("appends placeholders for tools referenced by replayed tool search results", () => {
    const baseSpecifications = [makeSpecification("get_weather")];
    const conversation = makeConversation([
      assistantMessageWithToolSearchResult(["get_weather", "removed_tool"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(missingReplayedToolNames).toEqual(["removed_tool"]);
    expect(specifications.map((s) => s.name)).toEqual([
      "get_weather",
      "removed_tool",
    ]);
  });

  it("never synthesizes a placeholder for the tool search tool itself", () => {
    const baseSpecifications = [makeSpecification("get_weather")];
    const conversation = makeConversation([
      assistantMessageWithToolSearchResult([
        "tool_search_tool_bm25",
        "tool_search_tool_regex",
      ]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(missingReplayedToolNames).toEqual([]);
    expect(specifications).toEqual(baseSpecifications);
  });

  it("dedupes missing tools replayed multiple times", () => {
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["removed_tool", "removed_tool"]),
      assistantMessageWithToolSearchResult(["removed_tool"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders([], conversation);

    expect(missingReplayedToolNames).toEqual(["removed_tool"]);
    expect(specifications).toHaveLength(1);
  });
});
