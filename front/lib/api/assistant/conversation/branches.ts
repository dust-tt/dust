import {
  createAgentMessageFromText,
  createUserMessage,
} from "@app/lib/api/assistant/conversation/messages";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
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

export async function mergeConversationBranch(
  auth: Authenticator,
  {
    branchId,
    transaction,
  }: {
    branchId: number;
    transaction?: Transaction;
  }
): Promise<
  Result<
    { mergedUserMessageSId: string; mergedAgentMessageSIds: string[] },
    Error
  >
> {
  const owner = auth.getNonNullableWorkspace();

  return withTransaction(async (t) => {
    const effectiveTransaction = transaction ?? t;

    const branch = await ConversationBranchResource.fetchByModelId(
      auth,
      branchId,
      {
        transaction: effectiveTransaction,
      }
    );

    if (!branch) {
      return new Err(new Error("branch_not_found"));
    }

    if (branch.userId !== auth.getNonNullableUser().id) {
      return new Err(new Error("branch_write_not_authorized"));
    }

    if (branch.state !== "open") {
      return new Err(new Error("branch_not_open"));
    }

    const branchMessages = await branch.fetchAllMessages(auth, {
      transaction: effectiveTransaction,
    });

    const [conversation] = await ConversationResource.fetchByModelIds(
      auth,
      [branch.conversationId],
      { transaction: effectiveTransaction }
    );
    if (!conversation) {
      return new Err(new Error("conversation_not_found"));
    }

    const renderedRes = await batchRenderMessages(
      auth,
      conversation,
      branchMessages,
      "light"
    );
    if (renderedRes.isErr()) {
      return new Err(renderedRes.error);
    }
    const rendered = renderedRes.value;

    const firstBranchUserMessage = branchMessages
      .filter((m) => m.userMessageId !== null)
      .sort((a, b) => a.rank - b.rank || b.version - a.version)[0];

    if (!firstBranchUserMessage?.userMessage) {
      return new Err(new Error("branch_has_no_user_message"));
    }

    const renderedFirstUserMessage = rendered.find(
      (m) => isUserMessageType(m) && m.sId === firstBranchUserMessage.sId
    );
    if (
      !renderedFirstUserMessage ||
      !isUserMessageType(renderedFirstUserMessage)
    ) {
      return new Err(new Error("branch_has_no_user_message"));
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

    const mergedUserMessage = await createUserMessage(auth, {
      // Only id/branchId are used by createUserMessage.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conversation: { id: branch.conversationId, branchId: null } as any,
      content: src.content,
      metadata: {
        type: "create",
        user: auth.user()?.toJSON() ?? null,
        rank: rankCursor++,
        context,
        agenticMessageData:
          src.agenticMessageType && src.agenticOriginMessageId
            ? {
                type: src.agenticMessageType,
                originMessageId: src.agenticOriginMessageId,
              }
            : undefined,
      },
      transaction: effectiveTransaction,
    });

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conversation: { id: branch.conversationId, branchId: null } as any,
        parentId: mergedUserMessage.id,
        rank: rankCursor++,
        content: contentOnly,
        agentConfiguration: {
          sId: branchAgentMessage.agentMessage!.agentConfigurationId,
          version: branchAgentMessage.agentMessage!.agentConfigurationVersion,
        },
        skipToolsValidation:
          branchAgentMessage.agentMessage!.skipToolsValidation,
        transaction: effectiveTransaction,
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

export async function closeConversationBranch(
  auth: Authenticator,
  {
    branchId,
    transaction,
  }: {
    branchId: number;
    transaction?: Transaction;
  }
): Promise<Result<{ closedBranchId: number }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  return withTransaction(async (t) => {
    const effectiveTransaction = transaction ?? t;

    const branch = await ConversationBranchResource.fetchByModelId(
      auth,
      branchId,
      {
        transaction: effectiveTransaction,
      }
    );

    if (!branch) {
      return new Err(new Error("branch_not_found"));
    }

    if (branch.userId !== auth.getNonNullableUser().id) {
      return new Err(new Error("branch_write_not_authorized"));
    }

    if (branch.state !== "open") {
      return new Err(new Error("branch_not_open"));
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
