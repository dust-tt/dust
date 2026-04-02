import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMParametersWithoutConversation,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import {
  type AgentMessageStatus,
  ConversationError,
  type ConversationMetadata,
  type ConversationVisibility,
  type UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Transaction } from "sequelize";

export interface LlmConversationOptions
  extends LLMParametersWithoutConversation {
  newMessages: ModelMessageTypeMultiActionsWithoutContentFragment[];
  existingConversationId?: string;
  title?: string;
  visibility?: ConversationVisibility;
  metadata?: ConversationMetadata;
  userContextUsername?: string;
  userContextOrigin: UserMessageOrigin;
}

/**
 * Create (or reuse) a conversation and store the new user messages.
 *
 * - If no `existingConversationId`: creates a new conversation.
 * - If `existingConversationId`: reuses that conversation.
 * - Creates one `UserMessageModel` + `MessageModel` per user-role message in
 *   `newMessages`, preserving the multi-turn structure.
 *
 * Returns the conversation resource.
 */
export async function writeBatchUserMessages(
  auth: Authenticator,
  {
    newMessages,
    existingConversationId,
    title,
    visibility = "unlisted",
    metadata = {},
    userContextUsername = "system",
    userContextOrigin,
  }: LlmConversationOptions
): Promise<Result<ConversationResource, ConversationError>> {
  const workspace = auth.getNonNullableWorkspace();

  let conversationResource: ConversationResource;

  if (existingConversationId) {
    const existing = await ConversationResource.fetchById(
      auth,
      existingConversationId
    );
    if (!existing) {
      return new Err(new ConversationError("conversation_not_found"));
    }
    conversationResource = existing;
  } else {
    conversationResource = await ConversationResource.makeNew(
      auth,
      {
        sId: generateRandomModelSId(),
        title: title ?? null,
        visibility,
        requestedSpaceIds: [],
        metadata,
      },
      null
    );
  }

  const userMessages = newMessages.filter((msg) => msg.role === "user");

  await withTransaction(async (t: Transaction) => {
    const maxRank = await MessageModel.max<number, MessageModel>("rank", {
      where: {
        conversationId: conversationResource.id,
        workspaceId: workspace.id,
      },
      transaction: t,
    });
    let nextRank = typeof maxRank === "number" ? maxRank + 1 : 0;

    for (const msg of userMessages) {
      const textParts = msg.content.filter(isTextContent).map((p) => p.text);
      const content = textParts.join("\n");

      const userMessage = await UserMessageModel.create(
        {
          workspaceId: workspace.id,
          userId: null,
          content,
          userContextUsername,
          userContextTimezone: "UTC",
          userContextFullName: null,
          userContextEmail: null,
          userContextProfilePictureUrl: null,
          userContextOrigin,
          clientSideMCPServerIds: [],
        },
        { transaction: t }
      );

      await MessageModel.create(
        {
          sId: generateRandomModelSId(),
          rank: nextRank,
          conversationId: conversationResource.id,
          parentId: null,
          userMessageId: userMessage.id,
          workspaceId: workspace.id,
        },
        { transaction: t }
      );
      nextRank++;
    }
  });

  return new Ok(conversationResource);
}

/**
 * Store LLM result events as an agent message in a conversation.
 *
 * - Creates an `AgentMessageModel` (status "succeeded" or "failed").
 * - Creates a `MessageModel` at the next rank, parented to the last user message.
 * - Creates `AgentStepContentModel` entries for text, tool calls, reasoning, errors.
 */
export interface StoreLlmResultInfo {
  agentMessageModelId: ModelId;
  agentMessageSId: string;
  userMessageSId: string;
}

export async function storeLlmResult(
  auth: Authenticator,
  conversation: ConversationResource,
  events: LLMEvent[],
  agentConfigurationId: string
): Promise<StoreLlmResultInfo> {
  const workspace = auth.getNonNullableWorkspace();

  const { agentMessageModel, agentMessageSId, userMessageSId } =
    await withTransaction(async (t: Transaction) => {
      // Find the last user message in this conversation to use as parent.
      const parentMessage = await MessageModel.findOne({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
          },
        ],
        order: [["rank", "DESC"]],
        transaction: t,
      });

      // Note: max rank cannot be inferred from parent message's rank:
      // There can be several agent messages in a row without user message when doing tool calls.
      const maxRank = await MessageModel.max<number, MessageModel>("rank", {
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        transaction: t,
      });
      const nextRank = typeof maxRank === "number" ? maxRank + 1 : 0;

      // Determine status from events.
      const hasError = events.some((e) => e instanceof EventError);
      const status: AgentMessageStatus = hasError ? "failed" : "succeeded";

      const firstError = events.find(
        (e): e is EventError => e instanceof EventError
      );

      const msg = await AgentMessageModel.create(
        {
          status,
          agentConfigurationId,
          agentConfigurationVersion: 0,
          workspaceId: workspace.id,
          skipToolsValidation: false,
          errorCode: firstError ? firstError.content.type : null,
          errorMessage: firstError ? firstError.content.message : null,
          completedAt: new Date(),
        },
        { transaction: t }
      );

      const messageSId = generateRandomModelSId();
      await MessageModel.create(
        {
          sId: messageSId,
          rank: nextRank,
          conversationId: conversation.id,
          parentId: parentMessage?.id ?? null,
          agentMessageId: msg.id,
          workspaceId: workspace.id,
        },
        { transaction: t }
      );

      return {
        agentMessageModel: msg,
        agentMessageSId: messageSId,
        userMessageSId: parentMessage?.sId ?? "",
      };
    });

  // Create step content entries from LLM events.
  let index = 0;
  for (const event of events) {
    const stepContent = eventToStoredStepContent(event);
    if (stepContent) {
      await AgentStepContentResource.createNewVersion({
        agentMessageId: agentMessageModel.id,
        workspaceId: workspace.id,
        step: 0,
        index,
        type: stepContent.type,
        value: stepContent,
      });
      index++;
    }
  }

  return {
    agentMessageModelId: agentMessageModel.id,
    agentMessageSId,
    userMessageSId,
  };
}

/**
 * Create (or reuse) conversations, store the new user messages, reconstruct the
 * full conversation from DB, and submit a batch to the LLM.
 *
 * Returns the batch ID and the conversation sIds in the same order as the input array.
 */
export async function sendBatchCallToLlm(
  auth: Authenticator,
  llm: LLM,
  conversations: LlmConversationOptions[]
): Promise<
  Result<
    {
      batchId: string;
      conversationIds: string[];
    },
    Error
  >
> {
  const conversationIds: string[] = [];
  const batchMap = new Map<string, LLMStreamParameters>();

  const modelConfig = llm.getModelConfig();

  for (const input of conversations) {
    // Store new messages in DB.
    const writeBatchResult = await writeBatchUserMessages(auth, input);
    if (writeBatchResult.isErr()) {
      return writeBatchResult;
    }
    const conversationResource = writeBatchResult.value;
    conversationIds.push(conversationResource.sId);

    // Reconstruct the full conversation from DB.
    const conversationRes = await getConversation(
      auth,
      conversationResource.sId
    );
    if (conversationRes.isErr()) {
      return conversationRes;
    }

    const promptText = systemPromptToText(input.prompt);
    const tools = JSON.stringify(
      input.specifications.map((s) => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
      }))
    );

    const modelConversationRes = await renderConversationForModel(auth, {
      conversation: conversationRes.value,
      model: modelConfig,
      prompt: promptText,
      tools,
      allowedTokenCount:
        modelConfig.contextSize - modelConfig.generationTokensCount,
    });

    if (modelConversationRes.isErr()) {
      return modelConversationRes;
    }

    batchMap.set(conversationResource.sId, {
      conversation: modelConversationRes.value.modelConversation,
      ...input,
    });
  }

  const batchId = await llm.sendBatchProcessing(batchMap);
  return new Ok({ batchId, conversationIds });
}

export interface BatchDownloadResult {
  events: Map<string, LLMEvent[]>;
  storedResultInfo: Map<string, StoreLlmResultInfo>;
}

/**
 * Download batch results from the LLM and store them as agent messages in the
 * corresponding conversations.
 */
export async function downloadBatchResultFromLlm(
  auth: Authenticator,
  llm: LLM,
  batchId: string,
  conversationIds: string[],
  agentConfigurationId: string
): Promise<BatchDownloadResult> {
  const events = await llm.getBatchResult(batchId);

  const conversationResources = await ConversationResource.fetchByIds(
    auth,
    conversationIds
  );
  const conversationById = new Map(
    conversationResources.map((c) => [c.sId, c])
  );

  const storedResultInfo = new Map<string, StoreLlmResultInfo>();
  for (const [conversationId, convEvents] of events) {
    const conversation = conversationById.get(conversationId);
    if (!conversation) {
      continue;
    }
    const info = await storeLlmResult(
      auth,
      conversation,
      convEvents,
      agentConfigurationId
    );
    storedResultInfo.set(conversationId, info);
  }

  return { events, storedResultInfo };
}

/**
 * Convert an LLM event to an AgentStepContent value.
 * Returns null for events that don't map to stored content (deltas, token usage, etc.).
 */
function eventToStoredStepContent(
  event: LLMEvent
): AgentContentItemType | null {
  if (event instanceof EventError) {
    return {
      type: "error",
      value: {
        code: event.content.type,
        message: event.content.message,
        metadata: null,
      },
    };
  }

  switch (event.type) {
    case "text_generated":
      return {
        type: "text_content",
        value: event.content.text,
      };

    case "tool_call":
      return {
        type: "function_call",
        value: {
          id: event.content.id,
          name: event.content.name,
          arguments: JSON.stringify(event.content.arguments),
          ...(event.metadata.thoughtSignature
            ? {
                metadata: { thoughtSignature: event.metadata.thoughtSignature },
              }
            : {}),
        },
      };

    case "reasoning_generated":
      return {
        type: "reasoning",
        value: {
          reasoning: event.content.text,
          metadata: event.metadata.encrypted_content ?? "",
          tokens: 0,
          provider: event.metadata.clientId,
        },
      };
    case "interaction_id":
    case "reasoning_delta":
    case "success":
    case "text_delta":
    case "token_usage":
    case "tool_call_delta":
      return null;
    default:
      assertNever(event);
  }
}
