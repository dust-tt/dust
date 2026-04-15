import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createUserMessage } from "@app/lib/api/assistant/conversation/messages";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getConversationRoute } from "@app/lib/utils/router";
import { withTransaction } from "@app/lib/utils/sql_utils";
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
  const upsertResult = await SkillResource.copyEnabledConversationSkills(auth, {
    parentConversation,
    childConversationId: childConversation.id,
    transaction,
  });

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

    return new Ok(childConversation.sId);
  });

  if (childConversationId.isErr()) {
    return childConversationId;
  }

  const childConversation = await getConversation(
    auth,
    childConversationId.value
  );
  if (childConversation.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        "The forked conversation could not be loaded after creation."
      )
    );
  }

  return childConversation;
}
