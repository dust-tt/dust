import {
  compactConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import {
  type ContentNodeAttachmentType,
  type FileAttachmentType,
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import { isProviderWhitelisted } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
} from "@app/types/api/internal/assistant";
import type { CompactionAttachmentIdReplacements } from "@app/types/assistant/compaction";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_3_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_SMALL_MODEL_CONFIG } from "@app/types/assistant/models/mistral";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG } from "@app/types/assistant/models/xai";
import { isFileContentFragment } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

export type CreateConversationForkErrorCode =
  | "conversation_not_found"
  | "invalid_request_error"
  | "internal_error";

type CarriedAttachment = {
  carriedAttachment:
    | ContentFragmentInputWithFileIdType
    | ContentFragmentInputWithContentNode;
  carriedFile: FileResource | null;
  attachErrorMessage: string;
  attachLogMetadata: Record<string, string>;
};

const ATTACHMENT_CARRY_OVER_CONCURRENCY = 4;

function filterConversationContentUpToRank(
  conversation: ConversationType,
  maxRank: number
): ConversationType {
  return {
    ...conversation,
    content: conversation.content.filter((versions) => {
      const latestVersion = versions[versions.length - 1];
      return latestVersion ? latestVersion.rank <= maxRank : false;
    }),
  };
}

function getForkCompactionModel(auth: Authenticator): SupportedModel | null {
  const modelConfiguration = [
    GPT_5_MINI_MODEL_CONFIG,
    CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
    GEMINI_3_FLASH_MODEL_CONFIG,
    MISTRAL_SMALL_MODEL_CONFIG,
    GROK_4_1_FAST_NON_REASONING_MODEL_CONFIG,
  ].find((model) => isProviderWhitelisted(auth, model.providerId));

  if (!modelConfiguration) {
    return null;
  }

  return {
    providerId: modelConfiguration.providerId,
    modelId: modelConfiguration.modelId,
  };
}

async function copyConversationMCPServerViews(
  auth: Authenticator,
  {
    parentConversation,
    childConversation,
    transaction,
  }: {
    parentConversation: ConversationWithoutContentType;
    childConversation: ConversationWithoutContentType;
    transaction: Transaction;
  }
): Promise<Result<undefined, DustError<CreateConversationForkErrorCode>>> {
  const parentMCPServerViews = await ConversationResource.fetchMCPServerViews(
    auth,
    parentConversation,
    { onlyEnabled: true }
  );

  if (parentMCPServerViews.length === 0) {
    return new Ok(undefined);
  }

  const readableMCPServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    parentMCPServerViews.map((view) => view.mcpServerViewId)
  );

  if (readableMCPServerViews.length === 0) {
    return new Ok(undefined);
  }

  const upsertResult = await ConversationResource.upsertMCPServerViews(auth, {
    conversation: childConversation,
    mcpServerViews: readableMCPServerViews,
    enabled: true,
    source: "conversation",
    agentConfigurationId: null,
    transaction,
  });

  if (upsertResult.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        "Failed to copy MCP server views into the forked conversation."
      )
    );
  }

  return new Ok(undefined);
}

async function copyConversationSkills(
  auth: Authenticator,
  {
    parentConversation,
    childConversation,
    transaction,
  }: {
    parentConversation: ConversationWithoutContentType;
    childConversation: ConversationWithoutContentType;
    transaction: Transaction;
  }
): Promise<Result<undefined, DustError<CreateConversationForkErrorCode>>> {
  const parentSkills = await SkillResource.listEnabledByConversation(auth, {
    conversation: parentConversation,
    transaction,
  });

  if (parentSkills.length === 0) {
    return new Ok(undefined);
  }

  const upsertResult = await SkillResource.upsertConversationSkills(
    auth,
    {
      conversationId: childConversation.id,
      skills: parentSkills,
      enabled: true,
    },
    { transaction }
  );

  if (upsertResult.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        "Failed to copy conversation skills into the forked conversation."
      )
    );
  }

  return new Ok(undefined);
}

async function carryOverFile(
  auth: Authenticator,
  {
    attachment,
    parentConversationId,
    childConversationId,
  }: {
    attachment: FileAttachmentType;
    parentConversationId: string;
    childConversationId: string;
  }
): Promise<CarriedAttachment | null> {
  const copiedFile = await FileResource.copyToConversation(auth, {
    sourceId: attachment.fileId,
    conversationId: childConversationId,
    includeProcessedVersion: true,
  });

  if (copiedFile.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId,
        childConversationId,
        sourceFileId: attachment.fileId,
        error: copiedFile.error,
      },
      "Failed to copy file attachment into forked conversation."
    );

    return null;
  }

  return {
    carriedAttachment: {
      title: attachment.title,
      fileId: copiedFile.value.sId,
    },
    carriedFile: copiedFile.value,
    attachErrorMessage:
      "Failed to attach copied file into forked conversation.",
    attachLogMetadata: {
      sourceFileId: attachment.fileId,
      copiedFileId: copiedFile.value.sId,
    },
  };
}

function carryOverContentNode(
  attachment: ContentNodeAttachmentType
): CarriedAttachment {
  return {
    carriedAttachment: {
      title: attachment.title,
      nodeId: attachment.nodeId,
      nodeDataSourceViewId: attachment.nodeDataSourceViewId,
    },
    carriedFile: null,
    attachErrorMessage:
      "Failed to reattach content node into forked conversation.",
    attachLogMetadata: {
      contentFragmentId: attachment.contentFragmentId,
      nodeId: attachment.nodeId,
      nodeDataSourceViewId: attachment.nodeDataSourceViewId,
    },
  };
}

async function addFileToConversationDatasource(
  auth: Authenticator,
  {
    parentConversationId,
    childConversationId,
    carriedFile,
  }: {
    parentConversationId: string;
    childConversationId: string;
    carriedFile: FileResource;
  }
): Promise<void> {
  const childDataSourceRes = await getOrCreateConversationDataSourceFromFile(
    auth,
    carriedFile
  );

  if (childDataSourceRes.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId,
        childConversationId,
        copiedFileId: carriedFile.sId,
        error: childDataSourceRes.error,
      },
      "Failed to get or create child conversation datasource for forked file."
    );

    return;
  }

  const upsertRes = await processAndUpsertToDataSource(
    auth,
    childDataSourceRes.value,
    { file: carriedFile }
  );

  if (upsertRes.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId,
        childConversationId,
        copiedFileId: carriedFile.sId,
        error: upsertRes.error,
      },
      "Failed to seed child conversation datasource for forked file."
    );
  }
}

async function carryOverConversationAttachments(
  auth: Authenticator,
  {
    parentConversation,
    childConversation,
    sourceMessageRank,
  }: {
    parentConversation: ConversationType;
    childConversation: ConversationType;
    sourceMessageRank: number;
  }
): Promise<CompactionAttachmentIdReplacements> {
  const parentConversationAtSource = filterConversationContentUpToRank(
    parentConversation,
    sourceMessageRank
  );
  const attachments = await listAttachments(auth, {
    conversation: parentConversationAtSource,
  });
  // We carry over direct conversation attachments and agent-generated tool outputs that were
  // attached before the fork point. Project-context files remain accessible via the shared
  // project and are therefore excluded here.
  const directConversationAttachments = attachments.filter((attachment) => {
    if (isFileAttachmentType(attachment)) {
      return (
        (attachment.source === "user" || attachment.source === "agent") &&
        !attachment.isInProjectContext
      );
    }

    return isContentNodeAttachmentType(attachment);
  });
  const attachmentResults = await concurrentExecutor(
    directConversationAttachments,
    async (attachment) => {
      let carriedResult: CarriedAttachment | null;

      if (isFileAttachmentType(attachment)) {
        carriedResult = await carryOverFile(auth, {
          attachment,
          parentConversationId: parentConversation.sId,
          childConversationId: childConversation.sId,
        });
      } else if (isContentNodeAttachmentType(attachment)) {
        carriedResult = carryOverContentNode(attachment);
      } else {
        assertNever(attachment);
      }

      if (!carriedResult) {
        return null;
      }

      const {
        carriedAttachment,
        carriedFile,
        attachErrorMessage,
        attachLogMetadata,
      } = carriedResult;

      const attachmentResult = await postNewContentFragment(
        auth,
        childConversation,
        carriedAttachment,
        null
      );

      if (attachmentResult.isErr()) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            parentConversationId: parentConversation.sId,
            childConversationId: childConversation.sId,
            ...attachLogMetadata,
            error: attachmentResult.error,
          },
          attachErrorMessage
        );

        return null;
      }

      const shouldCopyFileToDatasource =
        carriedFile !== null &&
        !carriedFile.useCaseMetadata?.skipDataSourceIndexing &&
        isFileTypeUpsertableForUseCase(carriedFile);

      if (shouldCopyFileToDatasource) {
        await addFileToConversationDatasource(auth, {
          parentConversationId: parentConversation.sId,
          childConversationId: childConversation.sId,
          carriedFile,
        });
      }

      return {
        sourceAttachmentId: isFileAttachmentType(attachment)
          ? attachment.fileId
          : attachment.contentFragmentId,
        targetAttachment: attachmentResult.value,
      };
    },
    { concurrency: ATTACHMENT_CARRY_OVER_CONCURRENCY }
  );

  return attachmentResults.reduce<CompactionAttachmentIdReplacements>(
    (acc, result) => {
      if (!result) {
        return acc;
      }

      acc[result.sourceAttachmentId] =
        isFileContentFragment(result.targetAttachment) &&
        result.targetAttachment.fileId !== null
          ? result.targetAttachment.fileId
          : result.targetAttachment.contentFragmentId;

      return acc;
    },
    {}
  );
}

export async function createConversationFork(
  auth: Authenticator,
  {
    conversationId,
    sourceMessageId,
  }: {
    conversationId: string;
    sourceMessageId?: string;
  }
): Promise<Result<string, DustError<CreateConversationForkErrorCode>>> {
  const parentConversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!parentConversation) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found.")
    );
  }

  const forkCompactionModel = getForkCompactionModel(auth);
  if (!forkCompactionModel) {
    return new Err(
      new DustError(
        "internal_error",
        "No whitelisted model available for fork compaction."
      )
    );
  }

  const branchedAt = new Date();

  const childConversationId = await withTransaction(async (transaction) => {
    const sourceMessage = await ConversationResource.resolveForkSourceMessage(
      auth,
      {
        conversationId: parentConversation.id,
        sourceMessageId,
        transaction,
      }
    );

    if (sourceMessage.isErr()) {
      return new Err(
        new DustError("invalid_request_error", sourceMessage.error.message)
      );
    }

    const childConversation = await ConversationResource.makeNew(
      auth,
      {
        sId: generateRandomModelSId(),
        title: null,
        visibility: parentConversation.visibility,
        depth: parentConversation.depth + 1,
        triggerId: null,
        spaceId: parentConversation.space?.id ?? null,
        requestedSpaceIds: [...parentConversation.requestedSpaceIds],
        metadata: {},
      },
      parentConversation.space,
      { transaction }
    );

    const copyMCPServerViewsResult = await copyConversationMCPServerViews(
      auth,
      {
        parentConversation: parentConversation.toJSON(),
        childConversation: childConversation.toJSON(),
        transaction,
      }
    );

    if (copyMCPServerViewsResult.isErr()) {
      return copyMCPServerViewsResult;
    }

    const copySkillsResult = await copyConversationSkills(auth, {
      parentConversation: parentConversation.toJSON(),
      childConversation: childConversation.toJSON(),
      transaction,
    });

    if (copySkillsResult.isErr()) {
      return copySkillsResult;
    }

    await ConversationResource.upsertParticipation(auth, {
      conversation: childConversation.toJSON(),
      action: "subscribed",
      user: auth.getNonNullableUser().toJSON(),
      transaction,
      lastReadAt: new Date(),
    });

    await ConversationForkResource.makeNew(
      auth,
      {
        parentConversation,
        childConversation,
        sourceMessageModelId: sourceMessage.value.id,
        branchedAt,
      },
      { transaction }
    );

    return new Ok({
      childConversationId: childConversation.sId,
      sourceMessageRank: sourceMessage.value.rank,
    });
  });

  if (childConversationId.isErr()) {
    return childConversationId;
  }

  const childConversation = await getConversation(
    auth,
    childConversationId.value.childConversationId
  );
  if (childConversation.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId: conversationId,
        childConversationId: childConversationId.value.childConversationId,
        error: childConversation.error,
      },
      "Failed to reload child conversation for fork attachment carryover."
    );

    return new Ok(childConversationId.value.childConversationId);
  }

  const parentConversationWithContent = await getConversation(
    auth,
    conversationId
  );
  if (parentConversationWithContent.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId: conversationId,
        childConversationId: childConversation.value.sId,
        error: parentConversationWithContent.error,
      },
      "Failed to reload parent conversation for fork attachment carryover."
    );
  }

  const attachmentIdReplacements = parentConversationWithContent.isOk()
    ? await carryOverConversationAttachments(auth, {
        parentConversation: parentConversationWithContent.value,
        childConversation: childConversation.value,
        sourceMessageRank: childConversationId.value.sourceMessageRank,
      })
    : undefined;
  const sourceConversation = {
    conversationId: parentConversation.sId,
    messageRank: childConversationId.value.sourceMessageRank,
    ...(attachmentIdReplacements &&
    Object.keys(attachmentIdReplacements).length > 0
      ? { attachmentIdReplacements }
      : {}),
  };

  const compactionResult = await compactConversation(auth, {
    conversation: childConversation.value,
    model: forkCompactionModel,
    sourceConversation,
  });

  if (compactionResult.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId: conversationId,
        childConversationId: childConversation.value.sId,
        error: compactionResult.error,
      },
      "Failed to initialize forked conversation compaction."
    );
    return new Ok(childConversation.value.sId);
  }

  return new Ok(childConversation.value.sId);
}
