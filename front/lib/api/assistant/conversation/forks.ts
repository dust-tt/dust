import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { compactConversation } from "@app/lib/api/assistant/conversation/compaction";
import { replaceStandaloneAttachmentIds } from "@app/lib/api/assistant/conversation/compaction_attachment_id_replacements";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import {
  getEffectiveWhiteListedProviders,
  getSmallWhitelistedModel,
} from "@app/lib/api/assistant/models";
import { getFileContent } from "@app/lib/api/files/utils";
import { uploadFrameContent } from "@app/lib/api/viz/upload_frame_content";
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
import { launchConversationForkWorkflow } from "@app/temporal/conversation_fork_queue/client";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
} from "@app/types/api/assistant";
import type {
  ContentNodeAttachmentType,
  FileAttachmentType,
} from "@app/types/api/assistant/conversation/attachments";
import type { CompactionAttachmentIdReplacements } from "@app/types/assistant/compaction";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isFileContentFragment } from "@app/types/content_fragment";
import { isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

type CreateConversationForkErrorCode =
  | "conversation_not_found"
  | "failed_to_copy_files"
  | "internal_error"
  | "invalid_request_error"
  | "unauthorized";

type CarriedAttachment = {
  carriedAttachment:
    | ContentFragmentInputWithFileIdType
    | ContentFragmentInputWithContentNode;
  carriedFile: FileResource | null;
  attachErrorMessage: string;
  attachLogMetadata: Record<string, string>;
};

type CarriedAttachmentResult = {
  sourceAttachmentId: string;
  targetAttachment: ContentFragmentType;
  carriedFile: FileResource | null;
};

const ATTACHMENT_CARRY_OVER_CONCURRENCY = 4;
const INTERACTIVE_CONTENT_REWRITE_CONCURRENCY = 4;

async function getForkCompactionModel(
  auth: Authenticator,
  {
    conversation,
    sourceMessageRank,
    transaction,
  }: {
    conversation: ConversationResource;
    sourceMessageRank: number;
    transaction?: Transaction;
  }
): Promise<SupportedModel | null> {
  const sourceMessageRun = await conversation.getLatestAgentMessageRun(auth, {
    maxRank: sourceMessageRank,
    transaction,
  });
  const sourceUsage =
    sourceMessageRun?.rank === sourceMessageRank
      ? (await sourceMessageRun.run.listRunUsages(auth))[0]
      : null;

  if (sourceUsage) {
    return {
      providerId: sourceUsage.providerId,
      modelId: sourceUsage.modelId,
    };
  }

  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
  const fallbackModel = getSmallWhitelistedModel(auth, undefined, {
    whiteListedProviders,
  });
  if (!fallbackModel) {
    return null;
  }

  return {
    providerId: fallbackModel.providerId,
    modelId: fallbackModel.modelId,
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
      conversation: childConversation,
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

async function rewriteCopiedInteractiveContentAttachmentIds(
  auth: Authenticator,
  {
    parentConversationId,
    childConversationId,
    copiedFiles,
    attachmentIdReplacements,
  }: {
    parentConversationId: string;
    childConversationId: string;
    copiedFiles: FileResource[];
    attachmentIdReplacements: CompactionAttachmentIdReplacements;
  }
): Promise<void> {
  if (Object.keys(attachmentIdReplacements).length === 0) {
    return;
  }

  const copiedFrames = copiedFiles.filter((file) =>
    isInteractiveContentType(file.contentType)
  );
  if (copiedFrames.length === 0) {
    return;
  }

  await concurrentExecutor(
    copiedFrames,
    async (file) => {
      const content = await getFileContent(auth, file, "original");
      if (content === null) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            parentConversationId,
            childConversationId,
            copiedFileId: file.sId,
          },
          "Failed to read copied interactive content file in forked conversation."
        );
        return;
      }

      const updatedContent = replaceStandaloneAttachmentIds(
        content,
        attachmentIdReplacements
      );
      if (updatedContent === content) {
        return;
      }

      const uploadResult = await uploadFrameContent(auth, file, updatedContent);
      if (uploadResult.isErr()) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            parentConversationId,
            childConversationId,
            copiedFileId: file.sId,
            error: uploadResult.error,
          },
          "Failed to rewrite copied interactive content file ids in forked conversation."
        );
      }
    },
    { concurrency: INTERACTIVE_CONTENT_REWRITE_CONCURRENCY }
  );
}

async function carryOverConversationAttachments(
  auth: Authenticator,
  {
    parentConversation,
    childConversation,
    sourceMessageRank,
  }: {
    parentConversation: ConversationWithoutContentType;
    childConversation: ConversationWithoutContentType;
    sourceMessageRank: number;
  }
): Promise<CompactionAttachmentIdReplacements> {
  const attachments = await listAttachments(auth, {
    conversation: parentConversation,
    upToRank: sourceMessageRank,
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
  const attachmentResults = await concurrentExecutor<
    (typeof directConversationAttachments)[number],
    CarriedAttachmentResult | null
  >(
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

      return {
        sourceAttachmentId: isFileAttachmentType(attachment)
          ? attachment.fileId
          : attachment.contentFragmentId,
        carriedFile,
        targetAttachment: attachmentResult.value,
      };
    },
    { concurrency: ATTACHMENT_CARRY_OVER_CONCURRENCY }
  );

  const attachmentIdReplacements =
    attachmentResults.reduce<CompactionAttachmentIdReplacements>(
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

  await rewriteCopiedInteractiveContentAttachmentIds(auth, {
    parentConversationId: parentConversation.sId,
    childConversationId: childConversation.sId,
    copiedFiles: attachmentResults.flatMap((result) =>
      result?.carriedFile ? [result.carriedFile] : []
    ),
    attachmentIdReplacements,
  });

  return attachmentIdReplacements;
}

type ConversationForkResult = {
  conversationId: string;
  parentConversationTitle: string | null;
  spaceId: string | null;
};

export async function createConversationFork(
  auth: Authenticator,
  {
    conversationId,
    sourceMessageId,
  }: {
    conversationId: string;
    sourceMessageId?: string;
  }
): Promise<
  Result<ConversationForkResult, DustError<CreateConversationForkErrorCode>>
> {
  const parentConversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!parentConversation) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found.")
    );
  }

  const parentSpace = parentConversation.space;
  if (parentSpace?.isProject() && !parentSpace.isMember(auth)) {
    return new Err(
      new DustError("unauthorized", "You are not a member of the Pod.")
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

    const forkCompactionModel = await getForkCompactionModel(auth, {
      conversation: parentConversation,
      sourceMessageRank: sourceMessage.value.rank,
      transaction,
    });
    if (!forkCompactionModel) {
      return new Err(
        new DustError(
          "internal_error",
          "No whitelisted model available for fork compaction."
        )
      );
    }

    const childConversation = await ConversationResource.makeNew(
      auth,
      {
        sId: generateRandomModelSId(),
        title: null,
        visibility: parentConversation.visibility,
        // Forking is an explicit user operation, so users expect to find the
        // conversation they created alongside their other root conversations.
        // Forks are not run_agent sub-conversations, even when their source is.
        depth: 0,
        triggerId: null,
        spaceId: parentConversation.space?.id ?? null,
        requestedSpaceIds: [...parentConversation.requestedSpaceIds],
        metadata: {
          useFileSystem: parentConversation.metadata?.useFileSystem ?? false,
          useDatabaseFileSystem:
            parentConversation.metadata?.useDatabaseFileSystem === true,
        },
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
      forkCompactionModel,
      sourceMessageRank: sourceMessage.value.rank,
      sourceMessageCreatedAtMs: sourceMessageId
        ? sourceMessage.value.agentMessage?.updatedAt.getTime()
        : undefined,
    });
  });

  if (childConversationId.isErr()) {
    return childConversationId;
  }

  const launchForkWorkflowResult = await launchConversationForkWorkflow({
    workspaceId: auth.getNonNullableWorkspace().sId,
    sourceConversationId: parentConversation.sId,
    destConversationId: childConversationId.value.childConversationId,
    sourceMessageTimestampMs:
      childConversationId.value.sourceMessageCreatedAtMs,
  });
  if (launchForkWorkflowResult.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        parentConversationId: parentConversation.sId,
        childConversationId: childConversationId.value.childConversationId,
        error: launchForkWorkflowResult.error,
      },
      "Failed to launch conversation fork workflow."
    );

    return new Err(
      new DustError(
        "failed_to_copy_files",
        "Failed to copy files from source conversation."
      )
    );
  }

  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
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

    return new Ok({
      conversationId: childConversationId.value.childConversationId,
      parentConversationTitle: parentConversation.title,
      spaceId: parentConversation.space?.sId ?? null,
    });
  }

  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
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
    model: childConversationId.value.forkCompactionModel,
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
    return new Ok({
      conversationId: childConversation.value.sId,
      parentConversationTitle: parentConversation.title,
      spaceId: parentConversation.space?.sId ?? null,
    });
  }

  return new Ok({
    conversationId: childConversation.value.sId,
    parentConversationTitle: parentConversation.title,
    spaceId: parentConversation.space?.sId ?? null,
  });
}
