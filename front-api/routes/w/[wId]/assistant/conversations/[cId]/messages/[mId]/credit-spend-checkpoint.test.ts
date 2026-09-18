import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLaunchAgentLoopWorkflow } = vi.hoisted(() => ({
  mockLaunchAgentLoopWorkflow: vi.fn(),
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: mockLaunchAgentLoopWorkflow,
}));

import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";

async function setupPausedMessage() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    method: "POST",
  });
  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  await ConversationResource.upsertParticipation(auth, {
    conversation,
    action: "posted",
    user: auth.getNonNullableUser().toJSON(),
  });

  const { messageRow: userMessageRow } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Do a long task",
    });
  const { messageRow: agentMessageRow, agentMessage } =
    await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      parentMessageModelId: userMessageRow.id,
      rank: 1,
    });
  await ConversationResource.markAgentMessageCreditSpendCheckpointPaused(auth, {
    agentMessage,
  });

  return { workspace, conversation, agentMessageRow };
}

function postDecision(
  workspace: { sId: string },
  cId: string,
  mId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/messages/${mId}/credit-spend-checkpoint`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/credit-spend-checkpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLaunchAgentLoopWorkflow.mockResolvedValue(new Ok(undefined));
  });

  it("continues the pause and relaunches the loop", async () => {
    const { workspace, conversation, agentMessageRow } =
      await setupPausedMessage();

    const response = await postDecision(
      workspace,
      conversation.sId,
      agentMessageRow.sId,
      { decision: "continue" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockLaunchAgentLoopWorkflow).toHaveBeenCalledTimes(1);
  });

  it("declines the pause and cancels the message without relaunching the loop", async () => {
    const { workspace, conversation, agentMessageRow } =
      await setupPausedMessage();

    const response = await postDecision(
      workspace,
      conversation.sId,
      agentMessageRow.sId,
      { decision: "decline" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockLaunchAgentLoopWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid decision", async () => {
    const { workspace, conversation, agentMessageRow } =
      await setupPausedMessage();

    const response = await postDecision(
      workspace,
      conversation.sId,
      agentMessageRow.sId,
      { decision: "bogus" }
    );

    expect(response.status).toBe(400);
    expect(mockLaunchAgentLoopWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when the message is not paused", async () => {
    const { workspace, conversation, agentMessageRow } =
      await setupPausedMessage();

    const first = await postDecision(
      workspace,
      conversation.sId,
      agentMessageRow.sId,
      { decision: "continue" }
    );
    expect(first.status).toBe(200);

    const second = await postDecision(
      workspace,
      conversation.sId,
      agentMessageRow.sId,
      { decision: "continue" }
    );

    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 403 when another user attempts to resolve the pause", async () => {
    const { workspace, conversation, agentMessageRow } =
      await setupPausedMessage();

    // Re-authenticate as a second user in the same workspace: this helper's mocked
    // session is what the route resolves auth from, so this switches the caller
    // for the request below without touching the message's own author.
    await createPrivateApiMockRequest({ workspace, method: "POST" });

    const response = await postDecision(
      workspace,
      conversation.sId,
      agentMessageRow.sId,
      { decision: "decline" }
    );

    expect(response.status).toBe(403);
    expect(mockLaunchAgentLoopWorkflow).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const response = await postDecision(
      workspace,
      "conv_does_not_exist",
      "msg_whatever",
      { decision: "continue" }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("conversation_not_found");
  });
});
