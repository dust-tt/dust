import {
  createAgentMessageFromText,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { UserMessageModel } from "@app/lib/models/agent/conversation";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationBranchModel } from "@app/lib/models/agent/conversation_branch";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  isUserMessageType,
  type UserMessageContext,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

export type MergeConversationBranchErrorCode =
  | "branch_not_found"
  | "branch_write_not_authorized"
  | "branch_not_open"
  | "conversation_not_found"
  | "branch_has_no_user_message"
  | "internal_error";

export async function mergeConversationBranch(
  auth: Authenticator,
  {
    branchId,
    conversationId,
    transaction,
  }: {
    branchId: string;
    conversationId: string;
    transaction?: Transaction;
  }
): Promise<
  Result<
    { mergedUserMessageSId: string; mergedAgentMessageSIds: string[] },
    DustError<MergeConversationBranchErrorCode>
  >
> {
  const owner = auth.getNonNullableWorkspace();

  return withTransaction(async (t) => {
    const effectiveTransaction = transaction ?? t;

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return new Err(
        new DustError("conversation_not_found", "Conversation not found.")
      );
    }

    const branch = await ConversationBranchResource.fetchById(auth, branchId);

    if (!branch) {
      return new Err(new DustError("branch_not_found", "Branch not found."));
    }

    if (branch.conversationId !== conversation.id) {
      return new Err(new DustError("branch_not_found", "Branch not found."));
    }

    if (branch.userId !== auth.getNonNullableUser().id) {
      return new Err(
        new DustError(
          "branch_write_not_authorized",
          "Not authorized to modify this branch."
        )
      );
    }

    if (branch.state !== "open") {
      return new Err(new DustError("branch_not_open", "Branch is not open."));
    }

    const branchMessages = await branch.fetchAllMessages(auth, {
      transaction: effectiveTransaction,
    });

    const effectiveConversation = conversation;

    const renderedRes = await batchRenderMessages(
      auth,
      effectiveConversation,
      branchMessages,
      "light"
    );
    if (renderedRes.isErr()) {
      return new Err(
        new DustError("internal_error", renderedRes.error.message)
      );
    }
    const rendered = renderedRes.value;

    const firstBranchUserMessage = branchMessages
      .filter((m) => m.userMessageId !== null)
      .sort((a, b) => a.rank - b.rank || b.version - a.version)[0];

    if (!firstBranchUserMessage?.userMessage) {
      return new Err(
        new DustError(
          "branch_has_no_user_message",
          "Branch has no user message."
        )
      );
    }

    const renderedFirstUserMessage = rendered.find(
      (m) => isUserMessageType(m) && m.sId === firstBranchUserMessage.sId
    );
    if (
      !renderedFirstUserMessage ||
      !isUserMessageType(renderedFirstUserMessage)
    ) {
      return new Err(
        new DustError(
          "branch_has_no_user_message",
          "Branch has no user message."
        )
      );
    }

    const branchAgentMessageRowsAllVersions = branchMessages.filter(
      (m) =>
        m.agentMessageId !== null &&
        m.parentId === firstBranchUserMessage.id &&
        m.visibility !== "deleted"
    );

    // Keep only latest version per rank (sorted by rank asc, version desc).
    const latestBranchAgentMessageRows: MessageModel[] = [];
    const seenRanks = new Set<number>();
    for (const m of branchAgentMessageRowsAllVersions) {
      if (!seenRanks.has(m.rank)) {
        latestBranchAgentMessageRows.push(m);
        seenRanks.add(m.rank);
      }
    }

    const src = firstBranchUserMessage.userMessage as UserMessageModel;
    const context: UserMessageContext = {
      username: src.userContextUsername,
      timezone: src.userContextTimezone,
      fullName: src.userContextFullName,
      email: src.userContextEmail,
      profilePictureUrl: src.userContextProfilePictureUrl,
      origin: src.userContextOrigin,
      clientSideMCPServerIds: src.clientSideMCPServerIds,
      lastTriggerRunAt: src.userContextLastTriggerRunAt
        ? src.userContextLastTriggerRunAt.getTime()
        : null,
      apiKeyId: src.userContextApiKeyId,
      authMethod: src.userContextAuthMethod,
    };

    const fullConversationRes = await getConversation(
      auth,
      conversationId,
      false
    );
    if (fullConversationRes.isErr()) {
      return new Err(
        new DustError("conversation_not_found", "Conversation not found.")
      );
    }

    const postRes = await postUserMessage(auth, {
      conversation: fullConversationRes.value,
      content: src.content,
      mentions: [],
      context,
      agenticMessageData:
        src.agenticMessageType && src.agenticOriginMessageId
          ? {
              type: src.agenticMessageType,
              originMessageId: src.agenticOriginMessageId,
            }
          : undefined,
      // We do not want to run any tool validations for those synthesized messages.
      skipToolsValidation: true,
      // Ensure we don't accidentally attribute to someone else.
      doNotAssociateUser: false,
    });
    if (postRes.isErr()) {
      // We only expose branch-level error codes here.
      return new Err(
        new DustError("internal_error", postRes.error.api_error.message)
      );
    }

    const mergedUserMessage = postRes.value.userMessage;

    const nextRank =
      ((await MessageModel.max<number | null, MessageModel>("rank", {
        where: {
          workspaceId: owner.id,
          conversationId: branch.conversationId,
          branchId: { [Op.is]: null },
        },
        transaction: effectiveTransaction,
      })) ?? -1) + 1;

    let rankCursor = nextRank;

    const mergedAgentMessageSIds: string[] = [];
    for (const branchAgentMessage of latestBranchAgentMessageRows) {
      const renderedAgent = rendered.find(
        (m) =>
          m.type === "agent_message" &&
          m.sId === branchAgentMessage.sId &&
          m.parentMessageId === renderedFirstUserMessage.sId
      );
      if (!renderedAgent || renderedAgent.type !== "agent_message") {
        continue;
      }
      const contentOnly = renderedAgent.content ?? "";

      const created = await createAgentMessageFromText(auth, {
        conversation: fullConversationRes.value,
        parentId: mergedUserMessage.id,
        rank: rankCursor++,
        content: contentOnly,
        agentConfiguration: {
          sId: branchAgentMessage.agentMessage!.agentConfigurationId,
          version: branchAgentMessage.agentMessage!.agentConfigurationVersion,
        },
        skipToolsValidation:
          branchAgentMessage.agentMessage!.skipToolsValidation,
      });

      mergedAgentMessageSIds.push(created.sId);
    }

    await ConversationBranchModel.update(
      { state: "merged" },
      {
        where: { id: branch.id, workspaceId: owner.id },
        transaction: effectiveTransaction,
      }
    );

    return new Ok({
      mergedUserMessageSId: mergedUserMessage.sId,
      mergedAgentMessageSIds,
    });
  }, transaction);
}

export type CloseConversationBranchErrorCode =
  | "branch_not_found"
  | "branch_write_not_authorized"
  | "branch_not_open"
  | "conversation_not_found"
  | "internal_error";

export async function closeConversationBranch(
  auth: Authenticator,
  {
    branchId,
    conversationId,
    transaction,
  }: {
    branchId: string;
    conversationId: string;
    transaction?: Transaction;
  }
): Promise<
  Result<
    { closedBranchId: number },
    DustError<CloseConversationBranchErrorCode>
  >
> {
  const owner = auth.getNonNullableWorkspace();

  return withTransaction(async (t) => {
    const effectiveTransaction = transaction ?? t;

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return new Err(
        new DustError("conversation_not_found", "Conversation not found.")
      );
    }

    const branch = await ConversationBranchResource.fetchById(auth, branchId);

    if (!branch) {
      return new Err(new DustError("branch_not_found", "Branch not found."));
    }

    if (branch.conversationId !== conversation.id) {
      return new Err(new DustError("branch_not_found", "Branch not found."));
    }

    if (branch.userId !== auth.getNonNullableUser().id) {
      return new Err(
        new DustError(
          "branch_write_not_authorized",
          "Not authorized to modify this branch."
        )
      );
    }

    if (branch.state !== "open") {
      return new Err(new DustError("branch_not_open", "Branch is not open."));
    }

    await ConversationBranchModel.update(
      { state: "closed" },
      {
        where: { id: branch.id, workspaceId: owner.id },
        transaction: effectiveTransaction,
      }
    );

    return new Ok({ closedBranchId: branch.id });
  }, transaction);
}
