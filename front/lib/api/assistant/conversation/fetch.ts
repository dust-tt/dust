import { getMaximalVersionAgentStepContent } from "@app/lib/api/assistant/configuration/steps";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationType,
  ModelId,
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

  const messages = await getConversationMessages(auth, conversation);

  const renderRes = await batchRenderMessages(
    auth,
    conversation,
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
    updated: conversation.updatedAt.getTime(),
    sId: conversation.sId,
    owner,
    title: conversation.title,
    visibility: conversation.visibility,
    depth: conversation.depth,
    triggerId: conversation.triggerSId,
    content,
    actionRequired,
    unread,
    hasError: conversation.hasError,
    requestedGroupIds: [],
    requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
    spaceId: conversation.space?.sId ?? null,
  });
}

async function getConversationMessages(
  auth: Authenticator,
  conversation: ConversationResource
): Promise<MessageModel[]> {
  const owner = auth.getNonNullableWorkspace();

  const messages = await MessageModel.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    order: [
      ["rank", "ASC"],
      ["version", "ASC"],
    ],
  });

  const userMessageModelIds: ModelId[] = [];
  const agentMessageModelIds: ModelId[] = [];
  const contentFragmentModelIds: ModelId[] = [];

  for (const { userMessageId, agentMessageId, contentFragmentId } of messages) {
    if (userMessageId) {
      userMessageModelIds.push(userMessageId);
    }
    if (agentMessageId) {
      agentMessageModelIds.push(agentMessageId);
    }
    if (contentFragmentId) {
      contentFragmentModelIds.push(contentFragmentId);
    }
  }

  // Fetch related models in parallel using indexed lookups.
  const [userMessages, agentMessages, contentFragments, agentStepContents] =
    await Promise.all([
      UserMessageModel.findAll({
        where: { id: userMessageModelIds, workspaceId: owner.id },
      }),
      AgentMessageModel.findAll({
        where: { id: agentMessageModelIds, workspaceId: owner.id },
      }),
      ContentFragmentModel.findAll({
        where: { id: contentFragmentModelIds, workspaceId: owner.id },
      }),
      AgentStepContentModel.findAll({
        where: { agentMessageId: agentMessageModelIds, workspaceId: owner.id },
      }),
    ]);

  const userMessageMap = new Map(userMessages.map((um) => [um.id, um]));
  const agentMessageMap = new Map(agentMessages.map((am) => [am.id, am]));
  const contentFragmentMap = new Map(contentFragments.map((cf) => [cf.id, cf]));

  // Group step contents by agent message ID.
  const stepContentsByAgentMessage = new Map<number, AgentStepContentModel[]>();
  for (const sc of agentStepContents) {
    const existing = stepContentsByAgentMessage.get(sc.agentMessageId);
    if (existing) {
      existing.push(sc);
    } else {
      stepContentsByAgentMessage.set(sc.agentMessageId, [sc]);
    }
  }

  // Assemble relationships onto message objects.
  for (const message of messages) {
    if (message.userMessageId) {
      message.userMessage = userMessageMap.get(message.userMessageId);
    }
    if (message.agentMessageId) {
      const agentMessage = agentMessageMap.get(message.agentMessageId);
      if (agentMessage) {
        const stepContents =
          stepContentsByAgentMessage.get(message.agentMessageId) ?? [];
        agentMessage.agentStepContents =
          getMaximalVersionAgentStepContent(stepContents);
        message.agentMessage = agentMessage;
      }
    }
    if (message.contentFragmentId) {
      message.contentFragment = contentFragmentMap.get(
        message.contentFragmentId
      );
    }
  }

  return messages;
}
