import type {
  APIError,
  ConversationPublicType,
  DustAPI,
  PublicPostContentFragmentRequestBody,
} from "@dust-tt/client";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { isTransientNetworkError } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/network_errors";
import type { ChildAgentBlob } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import { isRunAgentResumeState } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  Result,
  UserMessageOrigin,
} from "@app/types";
import { Err, isUserMessageType, Ok } from "@app/types";

/**
 * Determines if an error should be considered user-side.
 * User-side errors should not trigger alerts and their messages should be
 * surfaced to the model.
 */
function isUserSideError(error: APIError): boolean {
  return (
    error.type === "invalid_request_error" ||
    error.type === "plan_message_limit_exceeded"
  );
}

export async function getOrCreateConversation(
  api: DustAPI,
  agentLoopContext: AgentLoopRunContextType,
  {
    childAgentBlob,
    childAgentId,
    mainAgent,
    originMessage,
    mainConversation,
    query,
    toolsetsToAdd,
    fileOrContentFragmentIds,
    conversationId,
  }: {
    childAgentBlob: ChildAgentBlob;
    childAgentId: string;
    mainAgent: AgentConfigurationType;
    originMessage: AgentMessageType;
    mainConversation: ConversationType;
    query: string;
    toolsetsToAdd: string[] | null;
    fileOrContentFragmentIds: string[] | null;
    conversationId: string | null;
  }
): Promise<
  Result<
    {
      conversation: ConversationPublicType;
      isNewConversation: boolean;
      userMessageId: string;
    },
    MCPError
  >
> {
  const { agentMessage, stepContext } = agentLoopContext;

  const { resumeState } = stepContext;
  if (resumeState && isRunAgentResumeState(resumeState)) {
    const convRes = await api.getConversation({
      conversationId: resumeState.conversationId,
    });

    if (convRes.isErr()) {
      const isUserSide = isUserSideError(convRes.error);
      const isTransient = isTransientNetworkError(convRes.error);
      const message = isUserSide
        ? convRes.error.message
        : "Failed to get conversation";
      return new Err(
        new MCPError(message, {
          cause: convRes.error,
          tracked: !isUserSide && !isTransient,
        })
      );
    }

    return new Ok({
      conversation: convRes.value,
      isNewConversation: false,
      userMessageId: resumeState.userMessageId,
    });
  }

  const contentFragments: PublicPostContentFragmentRequestBody[] = [];

  if (fileOrContentFragmentIds) {
    // Get all files from the current conversation and filter which one to pass to the sub agent
    const attachments = listAttachments(mainConversation);
    for (const attachment of attachments) {
      if (
        isFileAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.fileId)
      ) {
        // Convert file attachment to content fragment
        contentFragments.push({
          title: attachment.title,
          fileId: attachment.fileId,
          url: null,
          context: null,
        });
      } else if (
        isContentNodeAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.contentFragmentId)
      ) {
        // Convert content node attachment to content fragment
        contentFragments.push({
          title: attachment.title,
          nodeId: attachment.nodeId,
          nodeDataSourceViewId: attachment.nodeDataSourceViewId,
          context: null,
        });
      }
    }
  }

  let parentOrigin: UserMessageOrigin | null = null;
  const parentMessage = mainConversation.content
    .flat()
    .find((m) => m.sId === originMessage.parentMessageId);

  if (!parentMessage) {
    return new Err(new MCPError("Parent message not found."));
  }

  if (!isUserMessageType(parentMessage)) {
    return new Err(new MCPError("Parent message is not a user message."));
  }

  parentOrigin = parentMessage.context.origin ?? null;

  if (conversationId) {
    const agenticMessageType =
      mainConversation.sId !== conversationId ? "run_agent" : "agent_handover";
    const messageRes = await api.postUserMessage({
      conversationId,
      message: {
        content: `${serializeMention({ name: childAgentBlob.name, sId: childAgentId })} ${query}`,
        mentions: [{ configurationId: childAgentId }],
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          username: mainAgent.name,
          fullName: `@${mainAgent.name}`,
          email: null,
          profilePictureUrl: mainAgent.pictureUrl,
          origin: parentOrigin,
          selectedMCPServerViewIds: toolsetsToAdd,
        },
        agenticMessageData: {
          // `run_agent` type will skip adding the conversation to the user history.
          type: agenticMessageType,
          originMessageId: originMessage.sId,
        },
      },
    });

    if (messageRes.isErr()) {
      const isUserSide = isUserSideError(messageRes.error);
      const isTransient = isTransientNetworkError(messageRes.error);
      const message = isUserSide
        ? messageRes.error.message
        : "Failed to create message";
      return new Err(
        new MCPError(message, {
          cause: messageRes.error,
          tracked: !isUserSide && !isTransient,
        })
      );
    }

    const convRes = await api.getConversation({
      conversationId,
    });

    if (convRes.isErr()) {
      const isUserSide = isUserSideError(convRes.error);
      const isTransient = isTransientNetworkError(convRes.error);
      const message = isUserSide
        ? convRes.error.message
        : "Failed to get conversation";
      return new Err(
        new MCPError(message, {
          cause: convRes.error,
          tracked: !isUserSide && !isTransient,
        })
      );
    }

    return new Ok({
      conversation: convRes.value,
      userMessageId: messageRes.value.sId,
      isNewConversation: true,
    });
  }

  const convRes = await api.createConversation({
    title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: `${serializeMention({ name: childAgentBlob.name, sId: childAgentId })} ${query}`,
      mentions: [{ configurationId: childAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        origin: parentOrigin,
        selectedMCPServerViewIds: toolsetsToAdd,
      },
      agenticMessageData: {
        // `run_agent` type will skip adding the conversation to the user history.
        type: "run_agent",
        originMessageId: originMessage.sId,
      },
    },
    contentFragments,
    skipToolsValidation: agentMessage.skipToolsValidation ?? false,
  });

  if (convRes.isErr()) {
    const isUserSide = isUserSideError(convRes.error);
    const isTransient = isTransientNetworkError(convRes.error);

    logger.error(
      {
        error: convRes.error,
        stepContext,
        isTransient,
        isUserSide,
      },
      "Failed to create conversation"
    );

    const message = isUserSide
      ? convRes.error.message
      : "Failed to create conversation";
    return new Err(
      new MCPError(message, {
        cause: convRes.error,
        tracked: !isUserSide && !isTransient,
      })
    );
  }

  const { conversation, message: createdUserMessage } = convRes.value;

  if (!createdUserMessage) {
    return new Err(new MCPError("Failed to retrieve the created message."));
  }

  return new Ok({
    conversation,
    isNewConversation: true,
    userMessageId: createdUserMessage.sId,
  });
}
