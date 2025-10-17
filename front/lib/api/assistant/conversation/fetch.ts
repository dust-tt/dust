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

  // We pre-create an array that will hold
  // the versions of each User/Assistant/ContentFragment message. The length of that array is by definition the
  // maximal rank of the conversation messages we just retrieved. In the case there is no message
  // the rank is -1 and the array length is 0 as expected.
  const rankMax = messages.reduce((acc, m) => Math.max(acc, m.rank), -1);
  const content: (
    | UserMessageType[]
    | AgentMessageType[]
    | ContentFragmentType[]
  )[] = Array.from({ length: rankMax + 1 }, () => []);

  // We need to escape the type system here to fill content.
  for (const m of messagesWithRankType) {
    (content[m.rank] as any).push(m);
  }

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
    hasError: conversation.hasError,
    requestedGroupIds:
      conversation.getConversationRequestedGroupIdsFromModel(auth),
    requestedSpaceIds:
      conversation.getConversationRequestedSpaceIdsFromModel(auth),
  });
}
