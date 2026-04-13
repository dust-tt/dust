import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";

export type CreateConversationForkErrorCode =
  | "conversation_not_found"
  | "invalid_request_error"
  | "internal_error";

async function resolveForkSourceMessage(
  auth: Authenticator,
  {
    parentConversationId,
    sourceMessageId,
    transaction,
  }: {
    parentConversationId: number;
    sourceMessageId?: string;
    transaction?: Transaction;
  }
): Promise<Result<MessageModel, DustError<CreateConversationForkErrorCode>>> {
  const workspace = auth.getNonNullableWorkspace();

  const where: WhereOptions<MessageModel> = {
    workspaceId: workspace.id,
    conversationId: parentConversationId,
    visibility: { [Op.ne]: "deleted" },
    agentMessageId: { [Op.ne]: null },
  };

  if (sourceMessageId) {
    where.sId = sourceMessageId;
  } else {
    where.branchId = { [Op.is]: null };
  }

  const sourceMessage = await MessageModel.findOne({
    where,
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["status"],
        where: {
          status: { [Op.ne]: "created" },
        },
      },
    ],
    order: sourceMessageId
      ? undefined
      : [
          ["rank", "DESC"],
          ["version", "DESC"],
        ],
    transaction,
  });

  if (!sourceMessage) {
    return new Err(
      new DustError(
        "invalid_request_error",
        sourceMessageId
          ? "The source message is missing or cannot be used for forking."
          : "The conversation has no completed agent message to fork from."
      )
    );
  }

  if (sourceMessage.branchId !== null) {
    const [branch] = await ConversationBranchResource.fetchByModelIds(auth, [
      sourceMessage.branchId,
    ]);

    if (!branch || !branch.canRead(auth)) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "The source message is missing or cannot be used for forking."
        )
      );
    }
  }

  return new Ok(sourceMessage);
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
    const sourceMessage = await resolveForkSourceMessage(auth, {
      parentConversationId: parentConversation.id,
      sourceMessageId,
      transaction,
    });

    if (sourceMessage.isErr()) {
      return sourceMessage;
    }

    const childConversation = await ConversationResource.makeNew(
      auth,
      {
        sId: generateRandomModelSId(),
        title: parentConversation.title,
        visibility: parentConversation.visibility,
        depth: parentConversation.depth + 1,
        triggerId: null,
        spaceId: parentConversation.space?.id ?? null,
        requestedSpaceIds: parentConversation.space
          ? [parentConversation.space.id]
          : [],
        metadata: {},
      },
      parentConversation.space,
      { transaction }
    );

    await ConversationResource.upsertParticipation(auth, {
      conversation: childConversation.toJSON(),
      action: "subscribed",
      user: auth.getNonNullableUser().toJSON(),
      transaction,
      lastReadAt: branchedAt,
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
