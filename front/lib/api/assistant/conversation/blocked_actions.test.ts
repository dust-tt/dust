import { clearActionRequiredIfNoBlockedActions } from "@app/lib/api/assistant/conversation/blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("blocked actions resolution", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });
  });

  async function createAgentMessageAtRank(rank: number) {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent ${rank}`,
    });

    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: rank - 1,
      content: "Test message",
    });

    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      parentId: userMessageRow.id,
    });

    return { messageRow, agentMessageRowId: messageRow.agentMessageId! };
  }

  async function getActionRequired() {
    const { actionRequired } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth,
        conversation.id
      );
    return actionRequired;
  }

  describe("clearActionRequiredIfNoBlockedActions", () => {
    it("clears the flag when the only blocked action belongs to an unresumable message", async () => {
      const { agentMessageRowId } = await createAgentMessageAtRank(1);
      await AgentMCPActionFactory.create({
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessageRowId,
      });
      await ConversationFactory.setAgentMessageStatus({
        workspace,
        agentMessageModelId: agentMessageRowId,
        status: "interrupted",
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });
      expect(await getActionRequired()).toBe(true);

      await clearActionRequiredIfNoBlockedActions(auth, {
        conversationId: conversation.sId,
      });

      expect(await getActionRequired()).toBe(false);
    });

    it("does not clear the flag when an actionable blocked action remains", async () => {
      const { agentMessageRowId } = await createAgentMessageAtRank(1);
      await AgentMCPActionFactory.create({
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessageRowId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });
      expect(await getActionRequired()).toBe(true);

      await clearActionRequiredIfNoBlockedActions(auth, {
        conversationId: conversation.sId,
      });

      expect(await getActionRequired()).toBe(true);
    });
  });
});
