import type { ConversationWithoutContentType, ModelId } from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import { chunk } from "lodash";

import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import type { Authenticator } from "@app/lib/auth";
import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { AgentConversationIncludeFileAction } from "@app/lib/models/assistant/actions/conversation/include_file";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentReasoningAction } from "@app/lib/models/assistant/actions/reasoning";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import {
  AgentMessage,
  AgentMessageFeedback,
  Conversation,
  ConversationParticipant,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { RetrievalDocumentResource } from "@app/lib/resources/retrieval_document_resource";

const DESTROY_MESSAGE_BATCH = 50;

async function destroyActionsRelatedResources(agentMessageIds: Array<ModelId>) {
  // First, retrieve the retrieval actions and documents.
  const retrievalActions = await AgentRetrievalAction.findAll({
    attributes: ["id"],
    where: { agentMessageId: agentMessageIds },
  });

  // Destroy retrieval resources.
  await RetrievalDocumentResource.deleteAllForActions(
    retrievalActions.map((a) => a.id)
  );

  await AgentRetrievalAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });

  // Destroy other actions.
  await AgentTablesQueryAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
  await AgentDustAppRunAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
  await AgentProcessAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
  await AgentWebsearchAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
  await AgentBrowseAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
  await AgentConversationIncludeFileAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
  await AgentReasoningAction.destroy({
    where: { agentMessageId: agentMessageIds },
  });
}

async function destroyMessageRelatedResources(messageIds: Array<ModelId>) {
  await MessageReaction.destroy({
    where: { messageId: messageIds },
  });
  await Mention.destroy({
    where: { messageId: messageIds },
  });
  // TODO: We should also destroy the parent message
  await Message.destroy({
    where: { id: messageIds },
  });
}

async function destroyContentFragments(
  messageAndContentFragmentIds: Array<{
    contentFragmentId: ModelId;
    messageId: string;
  }>,
  {
    conversationId,
    workspaceId,
  }: {
    conversationId: string;
    workspaceId: string;
  }
) {
  const contentFragmentIds = messageAndContentFragmentIds.map(
    (c) => c.contentFragmentId
  );
  if (contentFragmentIds.length === 0) {
    return;
  }

  const contentFragments =
    await ContentFragmentResource.fetchManyByModelIds(contentFragmentIds);

  for (const contentFragment of contentFragments) {
    const messageContentFragmentId = messageAndContentFragmentIds.find(
      (c) => c.contentFragmentId === contentFragment.id
    );

    if (!messageContentFragmentId) {
      throw new Error(
        `Failed to destroy content fragment with id ${contentFragment.id}.`
      );
    }

    const { messageId } = messageContentFragmentId;

    const deletionRes = await contentFragment.destroy({
      conversationId,
      messageId,
      workspaceId,
    });
    if (deletionRes.isErr()) {
      throw deletionRes;
    }
  }
}

async function destroyConversationDataSource(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationWithoutContentType;
  }
) {
  const dataSource = await DataSourceResource.fetchByConversation(
    auth,
    conversation
  );

  if (dataSource) {
    await dataSource.delete(auth, { hardDelete: true });
  }
}

// This belongs to the ConversationResource. The authenticator is expected to have access to the
// groups involved in the conversation.
export async function destroyConversation(
  auth: Authenticator,
  {
    conversationId,
  }: {
    conversationId: string;
  }
) {
  const workspace = auth.getNonNullableWorkspace();
  const conversationRes = await getConversationWithoutContent(
    auth,
    conversationId,
    // We skip access checks as some conversations associated with deleted spaces may have become
    // inaccessible, yet we want to be able to delete them here.
    { includeDeleted: true, dangerouslySkipPermissionFiltering: true }
  );
  if (conversationRes.isErr()) {
    throw conversationRes.error;
  }
  const conversation = conversationRes.value;

  const messages = await Message.findAll({
    attributes: [
      "id",
      "sId",
      "userMessageId",
      "agentMessageId",
      "contentFragmentId",
    ],
    where: { conversationId: conversation.id },
  });

  // To preserve the DB, we delete messages in batches.
  const messagesChunks = chunk(messages, DESTROY_MESSAGE_BATCH);
  for (const messagesChunk of messagesChunks) {
    const messageIds = messagesChunk.map((m) => m.id);
    const userMessageIds = removeNulls(messages.map((m) => m.userMessageId));
    const agentMessageIds = removeNulls(messages.map((m) => m.agentMessageId));
    const messageAndContentFragmentIds = removeNulls(
      messages.map((m) => {
        if (m.contentFragmentId) {
          return { contentFragmentId: m.contentFragmentId, messageId: m.sId };
        }

        return null;
      })
    );

    await destroyActionsRelatedResources(agentMessageIds);

    await UserMessage.destroy({
      where: { id: userMessageIds },
    });
    await AgentMessageContent.destroy({
      where: { agentMessageId: agentMessageIds },
    });
    await AgentMessageFeedback.destroy({
      where: { agentMessageId: agentMessageIds },
    });
    await AgentMessage.destroy({
      where: { id: agentMessageIds },
    });

    await destroyContentFragments(messageAndContentFragmentIds, {
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    });

    await destroyMessageRelatedResources(messageIds);
  }

  await ConversationParticipant.destroy({
    where: { conversationId: conversation.id },
  });

  await destroyConversationDataSource(auth, { conversation });

  const c = await Conversation.findOne({
    where: { id: conversation.id },
  });
  if (c) {
    await c.destroy();
  }
}
