import { MARK_CONVERSATION_READ_TOOL_NAME } from "@app/lib/api/actions/servers/common_utilities/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/common_utilities/tools";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

function getTool(name: string) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  assert(tool, `tool ${name} expected`);
  return tool;
}

describe("common_utilities mark_conversation_read", () => {
  it("marks any conversation as read and unread for the authenticated user", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    const extra = makeExtra(auth, conversation);

    // New conversations without a read row are unread for the user.
    let state =
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        otherConversation.sId
      );
    assert(state.isOk());
    expect(state.value.unread).toBe(true);

    const markReadResult = await getTool(
      MARK_CONVERSATION_READ_TOOL_NAME
    ).handler(
      {
        conversationId: otherConversation.sId,
        read: true,
      },
      extra
    );
    expect(markReadResult.isOk()).toBe(true);

    state = await ConversationResource.fetchConversationWithParticipantState(
      auth,
      otherConversation.sId
    );
    assert(state.isOk());
    expect(state.value.unread).toBe(false);

    const markUnreadResult = await getTool(
      MARK_CONVERSATION_READ_TOOL_NAME
    ).handler(
      {
        conversationId: otherConversation.sId,
        read: false,
      },
      extra
    );
    expect(markUnreadResult.isOk()).toBe(true);

    state = await ConversationResource.fetchConversationWithParticipantState(
      auth,
      otherConversation.sId
    );
    assert(state.isOk());
    expect(state.value.unread).toBe(true);
  });

  it("defaults conversationId to the current agent conversation", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const extra = makeExtra(auth, conversation);

    const result = await getTool(MARK_CONVERSATION_READ_TOOL_NAME).handler(
      { read: true },
      extra
    );
    expect(result.isOk()).toBe(true);

    const state =
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        conversation.sId
      );
    assert(state.isOk());
    expect(state.value.unread).toBe(false);
  });
});
