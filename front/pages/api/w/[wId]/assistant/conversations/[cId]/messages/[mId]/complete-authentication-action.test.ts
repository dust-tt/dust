import { beforeEach, describe, expect, it, vi } from "vitest";

const { removeEventMock } = vi.hoisted(() => ({
  removeEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: removeEventMock,
  }),
}));

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./complete-authentication-action";

describe("POST /api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/complete-authentication-action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeEventMock.mockClear();
  });

  async function createBlockedAuthenticationAction({
    workspaceId,
    agentMessageId,
  }: {
    workspaceId: number;
    agentMessageId: number;
  }) {
    const functionCallId = generateRandomModelSId();

    const stepContent = await AgentStepContentModel.create({
      workspaceId,
      agentMessageId,
      step: 1,
      index: 0,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: functionCallId,
          name: "test_tool",
          arguments: "{}",
        },
      },
    });

    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "test_tool",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "test_tool",
      mcpServerName: "test_server",
    };

    const action = await AgentMCPActionModel.create({
      workspaceId,
      agentMessageId,
      stepContentId: stepContent.id,
      mcpServerConfigurationId: generateRandomModelSId(),
      version: 0,
      status: "blocked_authentication_required",
      citationsAllocated: 0,
      augmentedInputs: {},
      toolConfiguration,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
      },
    });

    return AgentMCPActionResource.modelIdToSId({
      id: action.id,
      workspaceId,
    });
  }

  it("returns 200 and completes the authentication action", async () => {
    const { req, res, auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Test message",
    });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    const agentMessageRow = await AgentMessageModel.create({
      workspaceId: workspace.id,
      status: "created",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      skipToolsValidation: false,
    });

    const agentMessageMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      conversationId: conversation.id,
      rank: 1,
      parentId: messageRow.id,
      agentMessageId: agentMessageRow.id,
    });

    const actionId = await createBlockedAuthenticationAction({
      workspaceId: workspace.id,
      agentMessageId: agentMessageRow.id,
    });

    req.query.cId = conversation.sId;
    req.query.mId = agentMessageMessage.sId;
    req.body = { actionId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("returns 400 for an invalid request body", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    req.query.cId = conversation.sId;
    req.query.mId = generateRandomModelSId();
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 405 for unsupported methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });

    req.query.cId = generateRandomModelSId();
    req.query.mId = generateRandomModelSId();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
