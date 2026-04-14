import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createUserMessage } from "@app/lib/api/assistant/conversation/messages";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getConversationRoute } from "@app/lib/utils/router";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentMessageType,
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
  sourceMessageContent: string
): string {
  const parentConversationTitle = escapeMarkdownLinkText(
    parentConversation.title ?? UNTITLED_CONVERSATION_TITLE
  );
  const parentConversationUrl = getConversationRoute(
    workspaceId,
    parentConversation.sId
  );

  return [
    `The conversation was forked from [${parentConversationTitle}](${parentConversationUrl}).`,
    "",
    "This branch starts from the following source message:",
    "",
    sourceMessageContent,
  ].join("\n");
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

async function createForkInitializationMessage(
  auth: Authenticator,
  {
    parentConversation,
    childConversation,
    sourceMessageContent,
    transaction,
  }: {
    parentConversation: ConversationWithoutContentType;
    childConversation: ConversationWithoutContentType;
    sourceMessageContent: string;
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
      sourceMessageContent
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

async function renderForkSourceMessageContent(
  auth: Authenticator,
  {
    parentConversation,
    sourceMessage,
  }: {
    parentConversation: ConversationResource;
    sourceMessage: MessageModel;
  }
): Promise<Result<string, DustError<CreateConversationForkErrorCode>>> {
  const sourceMessageWithAgent = await MessageModel.findOne({
    where: {
      id: sourceMessage.id,
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: parentConversation.id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!sourceMessageWithAgent) {
    return new Err(
      new DustError("internal_error", "Failed to load the fork source message.")
    );
  }

  const renderedMessages = await batchRenderMessages(
    auth,
    parentConversation,
    [sourceMessageWithAgent],
    "full"
  );

  if (renderedMessages.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        "Failed to render the fork source message."
      )
    );
  }

  const renderedSourceMessage = renderedMessages.value.find(
    (message): message is AgentMessageType => message.type === "agent_message"
  );

  if (!renderedSourceMessage) {
    return new Err(
      new DustError(
        "internal_error",
        "Failed to resolve the fork source message."
      )
    );
  }

  return new Ok(renderedSourceMessage.content ?? "");
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

    const sourceMessageContent = await renderForkSourceMessageContent(auth, {
      parentConversation,
      sourceMessage: sourceMessage.value,
    });

    if (sourceMessageContent.isErr()) {
      return sourceMessageContent;
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

    await createForkInitializationMessage(auth, {
      parentConversation: parentConversation.toJSON(),
      childConversation: childConversation.toJSON(),
      sourceMessageContent: sourceMessageContent.value,
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
