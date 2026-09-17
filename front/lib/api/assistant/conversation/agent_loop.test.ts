import { runAgentLoopWorkflow } from "@app/lib/api/assistant/conversation/agent_loop";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { assert, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
}));

it("cancels the message when the agent becomes unreadable before launch", async () => {
  const { authenticator: authorAuth, workspace } = await createResourceTest({});
  const agent = await AgentConfigurationFactory.createTestAgent(authorAuth, {
    scope: "hidden",
  });
  const conversation = await ConversationFactory.create(authorAuth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  const { userMessage, messageRow } =
    await ConversationFactory.createUserMessage({
      auth: authorAuth,
      workspace,
      conversation,
      content: "Hello",
    });
  const { agentMessage } = await ConversationFactory.createAgentMessage(
    authorAuth,
    {
      workspace,
      conversation,
      agentConfig: agent,
      parentMessageModelId: messageRow.id,
      rank: 1,
    }
  );
  await ConversationResource.setIsRunningAgentLoop(authorAuth, {
    conversation,
    isRunningAgentLoop: true,
  });

  const otherUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, otherUser, { role: "user" });
  const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
    otherUser.sId,
    workspace.sId
  );

  const [returnedAgentMessage] = await runAgentLoopWorkflow({
    auth: otherAuth,
    agentMessages: [agentMessage],
    conversation,
    userMessage,
  });
  assert(returnedAgentMessage);
  expect(returnedAgentMessage.status).toBe("cancelled");
  expect(returnedAgentMessage.completedAt).toBeInstanceOf(Date);

  const updatedConversation = await ConversationResource.fetchById(
    authorAuth,
    conversation.sId
  );
  assert(updatedConversation);
  const message = await updatedConversation.getMessageById(
    authorAuth,
    agentMessage.sId
  );
  assert(message.isOk());
  expect(message.value.agentMessage?.status).toBe("cancelled");
  expect(message.value.agentMessage?.completedAt).toBeInstanceOf(Date);
  expect(updatedConversation.isRunningAgentLoop).toBe(false);
  expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
});
