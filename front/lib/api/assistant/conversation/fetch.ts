import {
  batchRenderMessages,
  getMaximalVersionAgentStepContent,
} from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import {
  AgentMessage,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationType,
  Result,
  UserMessageType,
} from "@app/types";
import { ConversationError, Err, Ok } from "@app/types";

export async function getConversation(
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false
): Promise<Result<ConversationType, ConversationError>> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    { includeDeleted }
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
      visibility: "visible",
    },
    order: [
      ["rank", "ASC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessage,
        as: "agentMessage",
        required: false,
        include: [
          {
            model: AgentStepContentModel,
            as: "agentStepContents",
            required: false,
          },
        ],
      },
      // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
      // along with messages in one query). Only once we move to a MessageResource will we be able
      // to properly abstract this.
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: false,
      },
    ],
  });

  // Filter to only keep the step content with the maximum version for each step and index combination.
  for (const message of messages) {
    if (message.agentMessage && message.agentMessage.agentStepContents) {
      message.agentMessage.agentStepContents =
        getMaximalVersionAgentStepContent(
          message.agentMessage.agentStepContents
        );
    }
  }

  const renderRes = await batchRenderMessages(
    auth,
    conversation.sId,
    messages,
    "full"
  );

  if (renderRes.isErr()) {
    return new Err(renderRes.error);
  }

  const messagesWithRankType = renderRes.value;

  // Create a compact array without gaps by grouping messages by rank
  // and sorting by rank to maintain chronological order
  const messagesByRank = new Map<
    number,
    (UserMessageType | AgentMessageType | ContentFragmentType)[]
  >();

  // Group messages by rank
  for (const m of messagesWithRankType) {
    if (!messagesByRank.has(m.rank)) {
      messagesByRank.set(m.rank, []);
    }
    messagesByRank.get(m.rank)!.push(m);
  }

  // Create compact array sorted by rank (no empty slots)
  const content: (
    | UserMessageType[]
    | AgentMessageType[]
    | ContentFragmentType[]
  )[] = Array.from(messagesByRank.entries())
    .sort(([rankA], [rankB]) => rankA - rankB)
    .map(([, messages]) => messages);

  const { actionRequired, unread } =
    await ConversationResource.getActionRequiredAndUnreadForUser(
      auth,
      conversation.id
    );

  return new Ok({
    id: conversation.id,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    owner,
    title: conversation.title,
    visibility: conversation.visibility,
    depth: conversation.depth,
    triggerId: conversation.triggerSId(),
    content,
    actionRequired,
    unread,
    requestedGroupIds:
      conversation.getConversationRequestedGroupIdsFromModel(auth),
  });
}
