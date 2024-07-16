import type { LightWorkspaceType, ModelId } from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import { chunk } from "lodash";

import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import {
  AgentRetrievalAction,
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentVisualizationAction } from "@app/lib/models/assistant/actions/visualization";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import type { Conversation } from "@app/lib/models/assistant/conversation";
import {
  AgentMessage,
  ConversationParticipant,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";

const DESTROY_MESSAGE_BATCH = 50;

async function destroyActionsRelatedResources(agentMessageIds: Array<ModelId>) {
  // First, retrieve the retrieval actions and documents.
  const retrievalActions = await AgentRetrievalAction.findAll({
    attributes: ["id"],
    where: { agentMessageId: agentMessageIds },
  });
  const retrievalDocuments = await RetrievalDocument.findAll({
    attributes: ["id"],
    where: { retrievalActionId: retrievalActions.map((a) => a.id) },
  });

  // Destroy retrieval resources.
  await RetrievalDocumentChunk.destroy({
    where: { retrievalDocumentId: retrievalDocuments.map((d) => d.id) },
  });
  await RetrievalDocument.destroy({
    where: { retrievalActionId: retrievalActions.map((a) => a.id) },
  });
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
  await AgentVisualizationAction.destroy({
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
    await ContentFragmentResource.fetchMany(contentFragmentIds);

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

// This belongs to the ConversationResource.
export async function destroyConversation(
  workspace: LightWorkspaceType,
  conversation: Conversation
) {
  const { id: conversationId } = conversation;

  const messages = await Message.findAll({
    attributes: [
      "id",
      "sId",
      "userMessageId",
      "agentMessageId",
      "contentFragmentId",
    ],
    where: { conversationId },
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
    await AgentMessage.destroy({
      where: { id: agentMessageIds },
    });

    await destroyContentFragments(messageAndContentFragmentIds, {
      conversationId: conversation.sId,
      workspaceId: workspace.sId,
    });

    await destroyMessageRelatedResources(messageIds);
  }

  await ConversationParticipant.destroy({
    where: { conversationId: conversationId },
  });

  await conversation.destroy();
}
