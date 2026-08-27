import { deleteConversationWindowCheckpoints } from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import { deleteOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  CompactionMessageModel,
  MessageModel,
  MessageReactionModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { getContentFragmentBaseCloudStorageForWorkspace } from "@app/lib/resources/content_fragment_resource";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MentionResource } from "@app/lib/resources/mention_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import {
  ProjectTaskConversationModel,
  ProjectTaskSourceModel,
} from "@app/lib/resources/storage/models/project_task";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { tracer } from "@app/logger/tracer";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import chunk from "lodash/chunk";
import type { WhereOptions } from "sequelize";

const DESTROY_MESSAGE_BATCH = 50;

async function destroyActionsRelatedResources(
  auth: Authenticator,
  agentMessageIds: Array<ModelId>
) {
  if (agentMessageIds.length === 0) {
    return;
  }

  const actionModelIds =
    await AgentMCPActionResource.listModelIdsByAgentMessageIds(
      auth,
      agentMessageIds
    );

  // Destroy MCP action output items (including GCS cleanup).
  await AgentMCPActionResource.destroyOutputItemsByActionIds(
    auth,
    actionModelIds
  );

  // Destroy the actions.
  const deleteActionsResult =
    await AgentMCPActionResource.deleteByAgentMessageId(auth, {
      agentMessageIds,
    });
  if (deleteActionsResult.isErr()) {
    throw deleteActionsResult.error;
  }
}

async function destroyMessageRelatedResources(
  auth: Authenticator,
  messageIds: ModelId[]
) {
  const owner = auth.getNonNullableWorkspace();

  await ConversationForkResource.deleteBySourceMessageModelIds(auth, {
    sourceMessageModelIds: messageIds,
  });

  await MessageReactionModel.destroy({
    where: {
      workspaceId: owner.id,
      messageId: messageIds,
    },
  });
  await MentionResource.deleteByMessageModelIds(auth, {
    messageModelIds: messageIds,
  });
  // TODO: We should also destroy the parent message
  await MessageModel.destroy({
    where: {
      workspaceId: owner.id,
      id: messageIds,
    },
  });
}

async function destroyContentFragments(
  auth: Authenticator,
  contentFragmentIds: ModelId[]
) {
  if (contentFragmentIds.length === 0) {
    return;
  }

  // GCS objects for this conversation were already removed via a single prefix
  // delete in destroyConversation.
  await ContentFragmentModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      id: contentFragmentIds,
    },
  });
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

export async function destroyConversationMessages(
  auth: Authenticator,
  messages: MessageModel[]
) {
  const owner = auth.getNonNullableWorkspace();

  // To preserve the DB, we delete messages in batches.
  const messagesChunks = chunk(messages, DESTROY_MESSAGE_BATCH);
  for (const messagesChunk of messagesChunks) {
    const messageIds = messagesChunk.map((m) => m.id);
    const userMessageIds = removeNulls(
      messagesChunk.map((m) => m.userMessageId)
    );
    const agentMessageIds = removeNulls(
      messagesChunk.map((m) => m.agentMessageId)
    );
    const compactionMessageIds = removeNulls(
      messagesChunk.map((m) => m.compactionMessageId)
    );
    const contentFragmentIds = removeNulls(
      messagesChunk.map((m) => m.contentFragmentId)
    );

    await AgentMessageConsumptionItemResource.deleteByAgentMessageModelIds(
      auth,
      {
        agentMessageModelIds: agentMessageIds,
      }
    );

    await destroyActionsRelatedResources(auth, agentMessageIds);

    await UserMessageModel.destroy({
      where: {
        id: userMessageIds,
        workspaceId: owner.id,
      },
    });
    await AgentStepContentResource.deleteByAgentMessageIds(auth, {
      agentMessageIds,
    });
    await AgentMessageFeedbackModel.destroy({
      where: {
        agentMessageId: agentMessageIds,
        workspaceId: owner.id,
      },
    });

    const whereAgentMessageSkill: WhereOptions<AgentMessageSkillModel> = {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentMessageId: agentMessageIds,
    };
    await AgentMessageSkillModel.destroy({
      where: whereAgentMessageSkill,
    });

    await AgentMessageModel.destroy({
      where: {
        id: agentMessageIds,
        workspaceId: owner.id,
      },
    });

    await destroyContentFragments(auth, contentFragmentIds);

    await CompactionMessageModel.destroy({
      where: {
        id: compactionMessageIds,
        workspaceId: owner.id,
      },
    });

    await destroyMessageRelatedResources(auth, messageIds);
  }
}

// This belongs to the ConversationResource. The authenticator is expected to have access to the
// groups involved in the conversation.
export async function destroyConversation(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationResource;
  }
): Promise<Result<void, Error>> {
  return tracer.trace("destroyConversation", async () => {
    const owner = auth.getNonNullableWorkspace();

    // Delete the conversation's sandbox egress allowlist file (owner-keyed, so
    // it is not deleted with individual sandboxes). Every conversation owns
    // its own file — inside or outside a Pod (the Pod's own file is scrubbed
    // by hardDeleteSpace) — and the delete ignores missing objects for
    // conversations that never approved a domain. A GCS failure aborts the
    // destroy before any row is touched; callers run in Temporal activities,
    // whose retry policy retries the whole destroy.
    const deleteOwnerPolicyRes = await deleteOwnerPolicy(
      auth,
      conversation.sId
    );
    if (deleteOwnerPolicyRes.isErr()) {
      return deleteOwnerPolicyRes;
    }

    await ConversationForkResource.deleteForConversationModelId(auth, {
      conversationModelId: conversation.id,
    });
    await ConversationSelectedSpaceResource.deleteForConversation(auth, {
      conversation,
    });

    // One prefix covers every content-fragment attachment for this conversation
    // (`.../conversations/{conversationId}/content_fragment/{messageId}/{text|raw}`).
    // Failures abort destroy before DB rows are touched so Temporal can retry.
    await getPrivateUploadBucket().deleteByPrefix(
      `${getContentFragmentBaseCloudStorageForWorkspace(owner.sId)}${conversation.sId}/`
    );
    await deleteConversationWindowCheckpoints({
      workspaceId: owner.sId,
      conversationId: conversation.sId,
    });

    const messages = await MessageModel.findAll({
      attributes: [
        "id",
        "userMessageId",
        "agentMessageId",
        "contentFragmentId",
        "compactionMessageId",
      ],
      where: {
        conversationId: conversation.id,
        workspaceId: owner.id,
      },
    });

    await destroyConversationMessages(auth, messages);

    await destroyConversationDataSource(auth, {
      conversation: conversation.toJSON(),
    });

    await AgentSuggestionModel.destroy({
      where: {
        workspaceId: owner.id,
        conversationId: conversation.id,
      },
    });

    await ConversationSkillModel.destroy({
      where: {
        workspaceId: owner.id,
        conversationId: conversation.id,
      },
    });

    await WakeUpResource.deleteByConversation(auth, conversation.toJSON());

    await ProjectTaskConversationModel.destroy({
      where: { workspaceId: owner.id, conversationId: conversation.id },
    });
    await ProjectTaskSourceModel.destroy({
      where: { workspaceId: owner.id, sourceId: conversation.sId },
    });

    await ConversationSandboxAdapter.deleteSandbox(auth, conversation);

    // TODO(2026-03-09 SANDBOX): Implement proper file deletion.
    // FileResource records associated with this conversation (via
    // useCaseMetadata.conversationId) are never deleted here. Both the DB rows and their GCS files
    // at the canonical path (files/w/{wId}/{fileId}/*) are left orphaned.
    // Delete all conversation mount path files from GCS. This is temporary and should be self
    // contained in the FileResource.
    // await getPrivateUploadBucket().deleteByPrefix(
    //   getConversationFilesBasePath({
    //     workspaceId: owner.sId,
    //     conversationId: conversation.sId,
    //   })
    // );
    const result = await conversation.delete(auth);
    if (result.isErr()) {
      return result;
    }

    return new Ok(undefined);
  });
}
