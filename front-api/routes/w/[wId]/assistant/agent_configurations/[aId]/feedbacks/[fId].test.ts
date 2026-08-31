import { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
  getAgentRecentAuthors: vi.fn().mockResolvedValue([]),
}));

vi.mock("@app/temporal/analytics_queue/client", () => ({
  launchAgentMessageFeedbackWorkflow: vi.fn().mockResolvedValue(undefined),
}));

async function createFeedback(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<AgentMessageFeedbackResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId,
    messagesCreatedAt: [new Date()],
  });

  const message = await MessageModel.findOne({
    where: {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      rank: 1,
    },
  });
  if (!message) {
    throw new Error("No agent message found at rank 1");
  }
  const { agentMessage } = await ConversationFactory.getMessage(
    auth,
    message.id
  );

  return AgentMessageFeedbackResource.makeNew({
    workspaceId: workspace.id,
    agentConfigurationId,
    agentConfigurationVersion: 0,
    conversationId: conversation.id,
    agentMessageId: agentMessage!.id,
    userId: user.id,
    thumbDirection: "down",
    content: "bad",
    isConversationShared: false,
    dismissed: false,
  });
}

function patchFeedback(
  workspace: { sId: string },
  aId: string,
  fId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/feedbacks/${fId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/feedbacks/:fId", () => {
  it("allows an editor of the agent to dismiss feedback", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
      method: "PATCH",
    });

    // The request user is the author, hence an editor of the agent.
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const feedback = await createFeedback(auth, agent.sId);

    const response = await patchFeedback(workspace, agent.sId, feedback.sId, {
      dismissed: true,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const refetched = await AgentMessageFeedbackResource.fetchById(auth, {
      feedbackId: feedback.sId,
      agentConfigurationId: agent.sId,
    });
    expect(refetched?.dismissed).toBe(true);
  });

  it("returns 403 for a user who is not an editor of the agent", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
      method: "PATCH",
    });

    // The agent is owned by a different builder, so the request user is not an
    // editor even though they have the builder role.
    const agentOwner: UserResource = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "user",
    });
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );

    const agent =
      await AgentConfigurationFactory.createTestAgent(agentOwnerAuth);
    const feedback = await createFeedback(agentOwnerAuth, agent.sId);

    const response = await patchFeedback(workspace, agent.sId, feedback.sId, {
      dismissed: true,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can modify agent feedback.",
      },
    });

    // The feedback must remain untouched.
    const refetched = await AgentMessageFeedbackResource.fetchById(
      agentOwnerAuth,
      { feedbackId: feedback.sId, agentConfigurationId: agent.sId }
    );
    expect(refetched?.dismissed).toBe(false);
  });
});
