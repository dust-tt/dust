import chunk from "lodash/chunk";

import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import {
  AgentMessage,
  AgentMessageFeedback,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type {
  ConversationError,
  ConversationWithoutContentType,
  ModelId,
  Result,
} from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";

const DESTROY_MESSAGE_BATCH = 50;

async function destroyActionsRelatedResources(
  auth: Authenticator,
  agentMessageIds: Array<ModelId>
) {
  // First, retrieve the MCP actions.
  const mcpActions = await AgentMCPActionResource.listByAgentMessageIds(
    auth,
    agentMessageIds
  );

  // Destroy MCP action output items.
  await AgentMCPActionOutputItem.destroy({
    where: { agentMCPActionId: mcpActions.map((a) => a.id) },
  });

  // Destroy the actions.
  await AgentMCPActionResource.deleteByAgentMessageId(auth, {
    agentMessageIds,
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
  auth: Authenticator,
  messageAndContentFragmentIds: Array<{
    contentFragmentId: ModelId;
    messageId: string;
  }>,
  {
    conversationId,
  }: {
    conversationId: string;
  }
) {
  const contentFragmentIds = messageAndContentFragmentIds.map(
    (c) => c.contentFragmentId
  );
  if (contentFragmentIds.length === 0) {
    return;
  }

  const contentFragments = await ContentFragmentResource.fetchManyByModelIds(
    auth,
    contentFragmentIds
  );

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
      workspaceId: auth.getNonNullableWorkspace().sId,
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
    // Directly delete the data source.
    await hardDeleteDataSource(auth, dataSource);
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
): Promise<Result<void, ConversationError>> {
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId,
      // We skip access checks as some conversations associated with deleted spaces may have become
      // inaccessible, yet we want to be able to delete them here.
      { includeDeleted: true, dangerouslySkipPermissionFiltering: true }
    );
  if (conversationRes.isErr()) {
    return new Err(conversationRes.error);
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
    where: {
      conversationId: conversation.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
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

    await destroyActionsRelatedResources(auth, agentMessageIds);

    await UserMessage.destroy({
      where: { id: userMessageIds },
    });
    await AgentStepContentModel.destroy({
      where: { agentMessageId: agentMessageIds },
    });
    await AgentMessageFeedback.destroy({
      where: { agentMessageId: agentMessageIds },
    });
    await AgentMessage.destroy({
      where: { id: agentMessageIds },
    });

    await destroyContentFragments(auth, messageAndContentFragmentIds, {
      conversationId: conversation.sId,
    });

    await destroyMessageRelatedResources(messageIds);
  }

  await destroyConversationDataSource(auth, { conversation });

  const c = await ConversationResource.fetchById(auth, conversation.sId, {
    includeDeleted: true,
    includeTest: true,
  });
  if (c) {
    await c.delete(auth);
  }

  return new Ok(undefined);
}
