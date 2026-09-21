import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/exit_events";
import {
  makeMCPToolExit,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { describe, expect, it } from "vitest";

async function makeCalendarRunContext(
  auth: Authenticator,
  {
    mcpServerViewId,
    toolServerId,
  }: { mcpServerViewId: string; toolServerId: string }
): Promise<AgentLoopRunContext> {
  const workspace = auth.getNonNullableWorkspace();
  const toolConfiguration: LightServerSideMCPToolConfigurationType = {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: "list_events",
    originalName: "list_events",
    mcpServerName: "google_calendar",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId,
    dustAppConfiguration: null,
    internalMCPServerId: toolServerId,
    secretName: null,
    dustProject: null,
    availability: "manual",
    permission: "never_ask",
    toolServerId,
    retryPolicy: "no_retry",
  };

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  const { messageRow, userMessage } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "List my events",
    });
  const { agentMessage, action } = await ConversationFactory.createAgentMessage(
    auth,
    {
      workspace,
      conversation,
      agentConfig,
      parentMessageModelId: messageRow.id,
      rank: 1,
      mcpAction: { toolConfiguration },
    }
  );
  if (!action) {
    throw new Error("Expected the agent message to hold an MCP action.");
  }

  const { model: agentModel, ...agentConfiguration } = agentConfig;
  return {
    contextType: "agent_loop",
    agentConfiguration,
    modelInfo: {
      endpoint: getTestStreamEndpoint(agentModel.modelId),
      ...agentModel,
    },
    agentMessage,
    conversation,
    stepContext: action.stepContext,
    action,
    toolConfiguration,
    userMessage,
  };
}

describe("getExitOrPauseEvents", () => {
  it("should normalize user cancellation early exits to non-errors", async () => {
    const output = makeMCPToolExit({
      message: "The tool execution was cancelled.",
      isError: true,
      reason: "user_cancellation",
    });

    const events = await getExitOrPauseEvents({} as Authenticator, {
      outputItems: output.content.map((content) => ({ content })),
      toolContext: {
        // The early exit path only reads identifiers off the run context; a partial mock is
        // enough here.
        runContext: {
          contextType: "agent_loop",
          action: { functionCallName: "test_tool", augmentedInputs: {} },
          agentConfiguration: {
            sId: "agent-configuration-id",
            name: "Test Agent",
          },
          agentMessage: { sId: "agent-message-id" },
          conversation: { sId: "conversation-id" },
        } as AgentLoopRunContext,
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_early_exit",
      configurationId: "agent-configuration-id",
      conversationId: "conversation-id",
      messageId: "agent-message-id",
      text: "The tool execution was cancelled.",
      isError: false,
      reason: "user_cancellation",
    });
  });

  it("should label a streamed personal auth block with the view display name", async () => {
    const { authenticator, globalSpace, workspace } = await createResourceTest({
      role: "admin",
    });
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      authenticator,
      { name: "google_calendar", useCase: "personal_actions" }
    );
    const view = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      globalSpace
    );
    const renameRes = await view.updateNameAndDescription(
      authenticator,
      "Team Calendar"
    );
    if (renameRes.isErr()) {
      throw new Error("Expected the view rename to succeed.");
    }
    const runContext = await makeCalendarRunContext(authenticator, {
      mcpServerViewId: view.sId,
      toolServerId: internalServer.id,
    });

    const output = makePersonalAuthenticationError("google_drive");

    const events = await getExitOrPauseEvents(authenticator, {
      outputItems: output.content.map((content) => ({ content })),
      toolContext: { runContext },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_personal_auth_required",
      metadata: {
        toolName: "list_events",
        mcpServerName: "google_calendar",
        mcpServerId: internalServer.id,
        mcpServerDisplayName: "Team Calendar",
      },
    });
  });

  it("should fall back to the formatted server name when the view cannot be resolved", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      authenticator,
      { name: "google_calendar", useCase: "personal_actions" }
    );
    const runContext = await makeCalendarRunContext(authenticator, {
      mcpServerViewId: MCPServerViewResource.modelIdToSId({
        id: 999_999_999,
        workspaceId: workspace.id,
      }),
      toolServerId: internalServer.id,
    });

    const output = makePersonalAuthenticationError("google_drive");

    const events = await getExitOrPauseEvents(authenticator, {
      outputItems: output.content.map((content) => ({ content })),
      toolContext: { runContext },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_personal_auth_required",
      metadata: {
        mcpServerId: internalServer.id,
        mcpServerDisplayName: "Google calendar",
      },
    });
  });
});
