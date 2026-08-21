import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: () => false,
  checkProgrammaticUsageLimits: vi.fn(),
}));

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth, globalSpace, user } =
    await createPrivateApiMockRequest({ role, method: "POST" });

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });

  return { auth, conversation, globalSpace, user, workspace };
}

function postMessage(
  workspace: { sId: string },
  conversationId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function getTools(workspace: { sId: string }, conversationId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${conversationId}/tools`
  );
}

function getMessages(
  workspace: { sId: string },
  conversationId: string,
  headers: Record<string, string>
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${conversationId}/messages?newResponseFormat=1`,
    { headers }
  );
}

async function setupUserMemoryAction() {
  const context = await setupTest("admin");
  const agentMessage = context.conversation.content
    .flat()
    .find(isAgentMessageType);
  assert(agentMessage, "Agent message not found");

  await AgentMCPActionFactory.create(context.auth, {
    workspace: context.workspace,
    conversationModelId: context.conversation.id,
    agentMessageModelId: agentMessage.agentMessageId,
    status: "succeeded",
    functionCallName: "user_memory__read",
    toolName: "read",
    mcpServerName: "user_memory",
    toolServerId: autoInternalMCPServerNameToSId({
      name: "user_memory",
      workspaceId: context.workspace.id,
    }),
  });

  return { ...context, agentMessage };
}

describe("GET /api/w/:wId/assistant/conversations/:cId/messages", () => {
  it("hides user-memory server identity from legacy Chrome message responses", async () => {
    const { workspace, conversation, agentMessage } =
      await setupUserMemoryAction();
    const headers = {
      origin: "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
    };

    const listResponse = await getMessages(
      workspace,
      conversation.sId,
      headers
    );
    expect(listResponse.status).toBe(200);
    const listData = await listResponse.json();
    expect(
      listData.messages.find(
        (message: { sId: string }) => message.sId === agentMessage.sId
      ).activitySteps
    ).toEqual([
      expect.objectContaining({
        internalMCPServerName: null,
        toolName: "read",
      }),
    ]);

    const singleResponse = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/messages/${agentMessage.sId}?viewType=light`,
      { headers }
    );
    expect(singleResponse.status).toBe(200);
    const singleData = await singleResponse.json();
    expect(singleData.message.activitySteps).toEqual([
      expect.objectContaining({
        internalMCPServerName: null,
        toolName: "read",
      }),
    ]);
  });

  it("preserves user-memory server identity for Chrome 0.1.14", async () => {
    const { workspace, conversation, agentMessage } =
      await setupUserMemoryAction();

    const response = await getMessages(workspace, conversation.sId, {
      origin: "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
      "x-dust-extension-version": "chrome-0.1.14",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(
      data.messages.find(
        (message: { sId: string }) => message.sId === agentMessage.sId
      ).activitySteps
    ).toEqual([
      expect.objectContaining({
        internalMCPServerName: "user_memory",
        toolName: "read",
      }),
    ]);
  });
});

describe("POST /api/w/:wId/assistant/conversations/:cId/messages", () => {
  it("enables MCP server views when selectedMCPServerViewIds are provided", async () => {
    const { workspace, conversation, auth, globalSpace, user } =
      await setupTest("admin");

    const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer.sId
      );
    assert(systemView, "MCP server view not found");
    const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
      systemView,
      space: globalSpace,
    });

    const toolsBefore = await getTools(workspace, conversation.sId);
    expect((await toolsBefore.json()).tools).toEqual([]);

    const response = await postMessage(workspace, conversation.sId, {
      content: "Message with conversation tools",
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
      context: {
        timezone: "Europe/Paris",
        profilePictureUrl: user.imageUrl ?? null,
        selectedMCPServerViewIds: [mcpServerView.sId],
      },
      skipToolsValidation: true,
    });

    expect(response.status).toBe(200);

    const toolsAfter = await getTools(workspace, conversation.sId);
    expect(toolsAfter.status).toBe(200);
    const toolsData = await toolsAfter.json();
    expect(toolsData.tools).toHaveLength(1);
    expect(toolsData.tools[0].sId).toBe(mcpServerView.sId);

    const relationships = await ConversationResource.fetchMCPServerViews(
      auth,
      conversation
    );
    expect(relationships).toHaveLength(1);
    expect(relationships[0].enabled).toBe(true);
    expect(relationships[0].mcpServerViewId).toBe(mcpServerView.id);
  });

  it("returns 404 when conversation doesn't exist", async () => {
    const { workspace } = await setupTest("admin");

    const response = await postMessage(workspace, "non-existent-conversation", {
      content: "Hello",
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
      context: {
        timezone: "Europe/Paris",
        profilePictureUrl: null,
      },
      skipToolsValidation: true,
    });

    expect(response.status).toBe(404);
  });
});
