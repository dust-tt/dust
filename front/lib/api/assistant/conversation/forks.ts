import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import {
  type ContentNodeAttachmentType,
  type FileAttachmentType,
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createUserMessage } from "@app/lib/api/assistant/conversation/messages";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getConversationRoute } from "@app/lib/utils/router";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
} from "@app/types/api/internal/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

export type CreateConversationForkErrorCode =
  | "conversation_not_found"
  | "invalid_request_error"
  | "internal_error";

const FORKED_CONVERSATION_TITLE_SUFFIX = " (forked)";
const FORK_INITIALIZATION_MESSAGE_RANK = 0;
const UNTITLED_CONVERSATION_TITLE = "Untitled conversation";

type CarriedAttachment = {
  carriedAttachment:
    | ContentFragmentInputWithFileIdType
    | ContentFragmentInputWithContentNode;
  carriedFile: FileResource | null;
  attachErrorMessage: string;
  attachLogMetadata: Record<string, string>;
};

function getForkedConversationTitle(title: string | null): string | null {
  if (title === null) {
    return null;
  }

  if (title.endsWith(FORKED_CONVERSATION_TITLE_SUFFIX)) {
    return title;
  }

  return `${title}${FORKED_CONVERSATION_TITLE_SUFFIX}`;
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, "\\$&");
}

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

function getForkInitializationMessageContent(
  workspaceId: string,
  parentConversation: ConversationWithoutContentType,
  sourceMessageId: string
): string {
  const parentConversationTitle = escapeMarkdownLinkText(
    parentConversation.title ?? UNTITLED_CONVERSATION_TITLE
  );
  const parentConversationUrl = getConversationRoute(
    workspaceId,
    parentConversation.sId
  );

  return `The conversation was forked from [${parentConversationTitle}](${parentConversationUrl}). Source message: ${sourceMessageId}.`;
}

async function copyConversationMCPServerViews(
  auth: Authenticator,
  {
    childConversation,
    mcpServerViews,
    transaction,
  }: {
    childConversation: ConversationWithoutContentType;
    mcpServerViews: MCPServerViewResource[];
    transaction: Transaction;
  }
): Promise<Result<undefined, DustError<CreateConversationForkErrorCode>>> {
  if (mcpServerViews.length === 0) {
    return new Ok(undefined);
  }

  const upsertResult = await ConversationResource.upsertMCPServerViews(auth, {
    conversation: childConversation,
    mcpServerViews,
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
    childConversation,
    skills,
    transaction,
  }: {
    childConversation: ConversationWithoutContentType;
    skills: SkillResource[];
    transaction: Transaction;
  }
): Promise<Result<undefined, DustError<CreateConversationForkErrorCode>>> {
  if (skills.length === 0) {
    return new Ok(undefined);
  }

  const upsertResult = await SkillResource.upsertConversationSkills(
    auth,
    {
      conversationId: childConversation.id,
      skills,
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

async function getConversationMCPServerViewsToCopy(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<MCPServerViewResource[]> {
  const parentMCPServerViews = await ConversationResource.fetchMCPServerViews(
    auth,
    conversation,
    { onlyEnabled: true }
  );

  if (parentMCPServerViews.length === 0) {
    return [];
  }

  return MCPServerViewResource.fetchByModelIds(
    auth,
    parentMCPServerViews.map((view) => view.mcpServerViewId)
  );
}

async function getConversationSkillsToCopy(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<SkillResource[]> {
  return SkillResource.listEnabledByConversation(auth, {
    conversation,
  });
}

async function getForkAttachmentSpaceIds(
  auth: Authenticator,
  {
    parentConversation,
    sourceMessageRank,
  }: {
    parentConversation: ConversationType;
    sourceMessageRank: number;
  }
): Promise<number[]> {
  const parentConversationAtSource = filterConversationContentUpToRank(
    parentConversation,
    sourceMessageRank
  );
  const attachments = await listAttachments(auth, {
    conversation: parentConversationAtSource,
  });
  const contentNodeDataSourceViewIds = Array.from(
    new Set(
      attachments
        .filter(isContentNodeAttachmentType)
        .map((attachment) => attachment.nodeDataSourceViewId)
    )
  );

  if (contentNodeDataSourceViewIds.length === 0) {
    return [];
  }

  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    contentNodeDataSourceViewIds
  );

  return Array.from(new Set(dataSourceViews.map((view) => view.space.id)));
}

async function getForkRequestedSpaceIds(
  auth: Authenticator,
  {
    parentConversation,
    parentConversationWithContent,
    sourceMessageRank,
    mcpServerViews,
    skills,
  }: {
    parentConversation: ConversationResource;
    parentConversationWithContent: ConversationType;
    sourceMessageRank: number;
    mcpServerViews: MCPServerViewResource[];
    skills: SkillResource[];
  }
): Promise<number[]> {
  const parentSpace = parentConversation.space;

  if (parentSpace?.isProject()) {
    return [parentSpace.id];
  }

  // Conversation-owned files inherit the child conversation ACL. Only copied setup and content
  // nodes contribute additional space requirements.
  const contentNodeSpaceIds = await getForkAttachmentSpaceIds(auth, {
    parentConversation: parentConversationWithContent,
    sourceMessageRank,
  });

  return Array.from(
    new Set([
      ...(parentSpace ? [parentSpace.id] : []),
      ...mcpServerViews.map((view) => view.space.id),
      ...skills.flatMap((skill) => skill.requestedSpaceIds),
      ...contentNodeSpaceIds,
    ])
  );
}

async function createForkInitializationMessage(
  auth: Authenticator,
  {
    parentConversation,
    childConversation,
    sourceMessageId,
    transaction,
  }: {
    parentConversation: ConversationWithoutContentType;
    childConversation: ConversationWithoutContentType;
    sourceMessageId: string;
    transaction: Transaction;
  }
) {
  // TODO(sessions): Replace this placeholder user message with a compaction message once
  // compaction messages are rendered in the main conversation UI.
  const user = auth.getNonNullableUser();

  await createUserMessage(auth, {
    conversation: childConversation,
    content: getForkInitializationMessageContent(
      auth.getNonNullableWorkspace().sId,
      parentConversation,
      sourceMessageId
    ),
    metadata: {
      type: "create",
      user: user.toJSON(),
      rank: FORK_INITIALIZATION_MESSAGE_RANK,
      context: {
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
        profilePictureUrl: user.imageUrl,
        timezone: "UTC",
        origin: "api",
      },
    },
    transaction,
  });
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
    childConversationDataSource,
  }: {
    parentConversationId: string;
    childConversationId: string;
    carriedFile: FileResource;
    childConversationDataSource: DataSourceResource | null;
  }
): Promise<DataSourceResource | null> {
  let nextChildConversationDataSource = childConversationDataSource;

  if (!nextChildConversationDataSource) {
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

      return childConversationDataSource;
    }

    nextChildConversationDataSource = childDataSourceRes.value;
  }

  const upsertRes = await processAndUpsertToDataSource(
    auth,
    nextChildConversationDataSource,
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

  return nextChildConversationDataSource;
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
): Promise<void> {
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
  let childConversationDataSource: DataSourceResource | null = null;

  for (const attachment of directConversationAttachments) {
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
      continue;
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

      continue;
    }

    const shouldCopyFileToDatasource =
      carriedFile !== null &&
      !carriedFile.useCaseMetadata?.skipDataSourceIndexing &&
      isFileTypeUpsertableForUseCase(carriedFile);

    if (shouldCopyFileToDatasource) {
      childConversationDataSource = await addFileToConversationDatasource(
        auth,
        {
          parentConversationId: parentConversation.sId,
          childConversationId: childConversation.sId,
          carriedFile,
          childConversationDataSource,
        }
      );
    }
  }
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

  const sourceMessage = await ConversationResource.resolveForkSourceMessage(
    auth,
    {
      conversationId: parentConversation.id,
      sourceMessageId,
    }
  );

  if (sourceMessage.isErr()) {
    return new Err(
      new DustError("invalid_request_error", sourceMessage.error.message)
    );
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
        error: parentConversationWithContent.error,
      },
      "Failed to load parent conversation for fork preparation."
    );

    return new Err(
      new DustError(
        "internal_error",
        "Failed to prepare the conversation fork."
      )
    );
  }

  const [mcpServerViewsToCopy, skillsToCopy] = await Promise.all([
    getConversationMCPServerViewsToCopy(auth, parentConversation.toJSON()),
    getConversationSkillsToCopy(auth, parentConversation.toJSON()),
  ]);
  const requestedSpaceIds = await getForkRequestedSpaceIds(auth, {
    parentConversation,
    parentConversationWithContent: parentConversationWithContent.value,
    sourceMessageRank: sourceMessage.value.rank,
    mcpServerViews: mcpServerViewsToCopy,
    skills: skillsToCopy,
  });

  const branchedAt = new Date();

  const childConversationId = await withTransaction(async (transaction) => {
    const childConversation = await ConversationResource.makeNew(
      auth,
      {
        sId: generateRandomModelSId(),
        title: getForkedConversationTitle(parentConversation.title),
        visibility: parentConversation.visibility,
        depth: parentConversation.depth + 1,
        triggerId: null,
        spaceId: parentConversation.space?.id ?? null,
        requestedSpaceIds,
        metadata: {},
      },
      parentConversation.space,
      { transaction }
    );

    const copyMCPServerViewsResult = await copyConversationMCPServerViews(
      auth,
      {
        childConversation: childConversation.toJSON(),
        mcpServerViews: mcpServerViewsToCopy,
        transaction,
      }
    );

    if (copyMCPServerViewsResult.isErr()) {
      return copyMCPServerViewsResult;
    }

    const copySkillsResult = await copyConversationSkills(auth, {
      childConversation: childConversation.toJSON(),
      skills: skillsToCopy,
      transaction,
    });

    if (copySkillsResult.isErr()) {
      return copySkillsResult;
    }

    await createForkInitializationMessage(auth, {
      parentConversation: parentConversation.toJSON(),
      childConversation: childConversation.toJSON(),
      sourceMessageId: sourceMessage.value.sId,
      transaction,
    });

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

  await carryOverConversationAttachments(auth, {
    parentConversation: parentConversationWithContent.value,
    childConversation: childConversation.value,
    sourceMessageRank: childConversationId.value.sourceMessageRank,
  });

  return new Ok(childConversation.value.sId);
}
