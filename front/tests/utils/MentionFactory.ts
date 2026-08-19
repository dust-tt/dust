import type { Authenticator } from "@app/lib/auth";
import type { MentionStatusType } from "@app/lib/models/agent/conversation";
import { MentionResource } from "@app/lib/resources/mention_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";

export class MentionFactory {
  /**
   * Records that an agent was mentioned at a given time.
   *
   * A mention hangs off a message, so this creates the conversation and message it needs. Tests that
   * only care about *when* an agent was last reached for should not have to say any of that.
   */
  static async agentMentionedAt(
    auth: Authenticator,
    {
      agentId,
      mentionedAt,
      status = "approved",
    }: {
      agentId: string;
      mentionedAt: Date;
      status?: MentionStatusType;
    }
  ): Promise<MentionResource> {
    const workspace = auth.getNonNullableWorkspace();

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentId,
      messagesCreatedAt: [],
      conversationCreatedAt: mentionedAt,
    });

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `@agent`,
      createdAt: mentionedAt,
    });

    return MentionResource.makeNew({
      messageId: messageRow.id,
      agentConfigurationId: agentId,
      workspaceId: workspace.id,
      status,
      createdAt: mentionedAt,
    });
  }
}
