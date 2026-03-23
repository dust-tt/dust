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
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import type {
  AgentMessageStatus,
  ConversationMetadata,
  ConversationVisibility,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";
import type { Transaction } from "sequelize";

export interface LlmConversationOptions
  extends LLMParametersWithoutConversation {
  newMessages: ModelMessageTypeMultiActionsWithoutContentFragment[];
  existingConversationId?: string;
  title?: string;
  visibility?: ConversationVisibility;
  metadata?: ConversationMetadata;
  userContextUsername?: string;
  userContextOrigin?: UserMessageOrigin;
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
export async function createLlmConversation(
  auth: Authenticator,
  {
    newMessages,
    existingConversationId,
    title,
    visibility = "unlisted",
    metadata = {},
    userContextUsername = "system",
    userContextOrigin = "api",
  }: LlmConversationOptions
): Promise<ConversationResource> {
  const workspace = auth.getNonNullableWorkspace();

  let conversationResource: ConversationResource;

  if (existingConversationId) {
    const existing = await ConversationResource.fetchById(
      auth,
      existingConversationId
    );
    if (!existing) {
      throw new Error(`Conversation not found: ${existingConversationId}`);
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

  return conversationResource;
}

/**
 * Store LLM result events as an agent message in a conversation.
 *
 * - Creates an `AgentMessageModel` (status "succeeded" or "failed").
 * - Creates a `MessageModel` at the next rank, parented to the last user message.
 * - Creates `AgentStepContentModel` entries for text, tool calls, reasoning, errors.
 */
export async function storeLlmResult(
  auth: Authenticator,
  conversation: ConversationResource,
  events: LLMEvent[],
  agentConfigurationId: string
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

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

    const agentMessage = await AgentMessageModel.create(
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

    await MessageModel.create(
      {
        sId: generateRandomModelSId(),
        rank: nextRank,
        conversationId: conversation.id,
        parentId: parentMessage?.id ?? null,
        agentMessageId: agentMessage.id,
        workspaceId: workspace.id,
      },
      { transaction: t }
    );

    // Create step content entries from LLM events.
    let index = 0;
    for (const event of events) {
      const stepContent = eventToStepContent(event);
      if (stepContent) {
        await AgentStepContentResource.createNewVersion(
          {
            agentMessageId: agentMessage.id,
            workspaceId: workspace.id,
            step: 0,
            index,
            type: stepContent.type,
            value: stepContent,
          },
          t
        );
        index++;
      }
    }
  });
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
): Promise<{
  batchId: string;
  conversationIds: string[];
}> {
  const conversationIds: string[] = [];
  const batchMap = new Map<string, LLMStreamParameters>();

  const modelConfig = llm.getModelConfig();

  for (const input of conversations) {
    // Store new messages in DB.
    const conversationResource = await createLlmConversation(auth, input);
    conversationIds.push(conversationResource.sId);

    // Reconstruct the full conversation from DB.
    const conversationRes = await getConversation(
      auth,
      conversationResource.sId
    );
    if (conversationRes.isErr()) {
      throw new Error(
        `Failed to load conversation ${conversationResource.sId}: ${conversationRes.error.message}`
      );
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
      throw new Error(
        `Failed to render conversation ${conversationResource.sId}: ${modelConversationRes.error.message}`
      );
    }

    batchMap.set(conversationResource.sId, {
      conversation: modelConversationRes.value.modelConversation,
      ...input,
    });
  }

  const batchId = await llm.sendBatchProcessing(batchMap);
  return { batchId, conversationIds };
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
): Promise<Map<string, LLMEvent[]>> {
  const results = await llm.getBatchResult(batchId);

  const conversationResources = await ConversationResource.fetchByIds(
    auth,
    conversationIds
  );
  const conversationBySId = new Map(
    conversationResources.map((c) => [c.sId, c])
  );

  for (const [conversationId, events] of results) {
    const conversation = conversationBySId.get(conversationId);
    if (!conversation) {
      continue;
    }
    await storeLlmResult(auth, conversation, events, agentConfigurationId);
  }

  return results;
}

/**
 * Convert an LLM event to an AgentStepContent value.
 * Returns null for events that don't map to stored content (deltas, token usage, etc.).
 */
function eventToStepContent(event: LLMEvent): AgentContentItemType | null {
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

    default:
      return null;
  }
}
