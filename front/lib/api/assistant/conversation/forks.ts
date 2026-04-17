import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createUserMessage } from "@app/lib/api/assistant/conversation/messages";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getConversationRoute } from "@app/lib/utils/router";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

export type CreateConversationForkErrorCode =
  | "conversation_not_found"
  | "invalid_request_error"
  | "internal_error";

const FORKED_CONVERSATION_TITLE_SUFFIX = " (forked)";
const FORK_INITIALIZATION_MESSAGE_RANK = 0;
const UNTITLED_CONVERSATION_TITLE = "Untitled conversation";

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

async function copyConversationFileAttachments(
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
): Promise<number> {
  const parentConversationAtSource = filterConversationContentUpToRank(
    parentConversation,
    sourceMessageRank
  );
  const attachments = await listAttachments(auth, {
    conversation: parentConversationAtSource,
  });
  // For now we only carry over direct file attachments that were explicitly posted into the
  // conversation. Project-context files remain accessible via the shared project, and agent-
  // generated files need a separate follow-up because they are not re-attached through content
  // fragments today.
  const directConversationFileAttachments = attachments
    .filter(isFileAttachmentType)
    .filter(
      (attachment) =>
        attachment.source === "user" && !attachment.isInProjectContext
    );

  let copiedAttachmentCount = 0;
  for (const attachment of directConversationFileAttachments) {
    const copiedFile = await FileResource.copyToConversation(auth, {
      sourceId: attachment.fileId,
      conversationId: childConversation.sId,
    });

    if (copiedFile.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          parentConversationId: parentConversation.sId,
          childConversationId: childConversation.sId,
          sourceFileId: attachment.fileId,
          error: copiedFile.error,
        },
        "Failed to copy file attachment into forked conversation."
      );
      continue;
    }

    const attachmentResult = await postNewContentFragment(
      auth,
      childConversation,
      {
        title: attachment.title,
        fileId: copiedFile.value.sId,
      },
      null
    );

    if (attachmentResult.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          parentConversationId: parentConversation.sId,
          childConversationId: childConversation.sId,
          sourceFileId: attachment.fileId,
          copiedFileId: copiedFile.value.sId,
          error: attachmentResult.error,
        },
        "Failed to attach copied file into forked conversation."
      );
      continue;
    }

    copiedAttachmentCount += 1;
  }

  return copiedAttachmentCount;
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
): Promise<
  Result<ConversationType, DustError<CreateConversationForkErrorCode>>
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
        title: getForkedConversationTitle(parentConversation.title),
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
    return new Err(
      new DustError(
        "internal_error",
        "The forked conversation could not be loaded after creation."
      )
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
        childConversationId: childConversation.value.sId,
        error: parentConversationWithContent.error,
      },
      "Failed to reload parent conversation for fork file attachment copy."
    );
    return childConversation;
  }

  const copiedAttachmentCount = await copyConversationFileAttachments(auth, {
    parentConversation: parentConversationWithContent.value,
    childConversation: childConversation.value,
    sourceMessageRank: childConversationId.value.sourceMessageRank,
  });


  return updatedChildConversation;
}
