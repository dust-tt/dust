import type {
  ConversationPublicType,
  DustAPI,
  PublicPostContentFragmentRequestBody,
  Result,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type { ChildAgentBlob } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import { isRunAgentResumeState } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import logger from "@app/logger/logger";
import type { AgentConfigurationType, ConversationType } from "@app/types";

export async function getOrCreateConversation(
  api: DustAPI,
  agentLoopContext: AgentLoopRunContextType,
  {
    childAgentBlob,
    childAgentId,
    mainAgent,
    mainConversation,
    query,
    toolsetsToAdd,
    fileOrContentFragmentIds,
    conversationId,
    contentFragments,
  }: {
    childAgentBlob: ChildAgentBlob;
    childAgentId: string;
    mainAgent: AgentConfigurationType;
    mainConversation: ConversationType;
    query: string;
    toolsetsToAdd: string[] | null;
    fileOrContentFragmentIds: string[] | null;
    conversationId: string | null;
    contentFragments: PublicPostContentFragmentRequestBody[] | null;
  }
): Promise<
  Result<
    {
      conversation: ConversationPublicType;
      isNewConversation: boolean;
      userMessageId: string;
    },
    Error
  >
> {
  const { agentMessage, stepContext } = agentLoopContext;

  const { resumeState } = stepContext;
  if (resumeState && isRunAgentResumeState(resumeState)) {
    const convRes = await api.getConversation({
      conversationId: resumeState.conversationId,
    });

    if (convRes.isErr()) {
      return new Err(new Error("Failed to get conversation"));
    }

    return new Ok({
      conversation: convRes.value,
      isNewConversation: false,
      userMessageId: resumeState.userMessageId,
    });
  }

  const contentFragmentsToUse: PublicPostContentFragmentRequestBody[] =
    contentFragments ? [...contentFragments] : [];

  if (fileOrContentFragmentIds) {
    // Get all files from the current conversation and filter which one to pass to the sub agent
    const attachments = listAttachments(mainConversation);
    for (const attachment of attachments) {
      if (
        isFileAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.fileId)
      ) {
        // Convert file attachment to content fragment
        contentFragmentsToUse.push({
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
        contentFragmentsToUse.push({
          title: attachment.title,
          nodeId: attachment.nodeId,
          nodeDataSourceViewId: attachment.nodeDataSourceViewId,
          context: null,
        });
      }
    }
  }

  if (conversationId) {
    // Post content fragments separately for existing conversations
    if (contentFragmentsToUse.length > 0) {
      for (const contentFragment of contentFragmentsToUse) {
        const fragmentRes = await api.postContentFragment({
          conversationId,
          contentFragment,
        });

        if (fragmentRes.isErr()) {
          return new Err(new Error("Failed to post content fragment"));
        }
      }
    }

    const messageRes = await api.postUserMessage({
      conversationId,
      message: {
        content: `:mention[${childAgentBlob.name}]{sId=${childAgentId}} ${query}`,
        mentions: [{ configurationId: childAgentId }],
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          username: mainAgent.name,
          fullName: `@${mainAgent.name}`,
          email: null,
          profilePictureUrl: mainAgent.pictureUrl,
          // `run_agent` origin will skip adding the conversation to the user history.
          origin:
            mainConversation.sId !== conversationId
              ? "run_agent"
              : "agent_handover",
          selectedMCPServerViewIds: toolsetsToAdd,
        },
      },
    });

    if (messageRes.isErr()) {
      return new Err(new Error("Failed to create message"));
    }

    const convRes = await api.getConversation({
      conversationId,
    });

    if (convRes.isErr()) {
      return new Err(new Error("Failed to get conversation"));
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
      content: `:mention[${childAgentBlob.name}]{sId=${childAgentId}} ${query}`,
      mentions: [{ configurationId: childAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        // `run_agent` origin will skip adding the conversation to the user history.
        origin: "run_agent",
        selectedMCPServerViewIds: toolsetsToAdd,
      },
    },
    contentFragments: contentFragmentsToUse,
    skipToolsValidation: agentMessage.skipToolsValidation ?? false,
    params: {
      // TODO(DURABLE_AGENT 2025-08-20): Remove this if we decided to always use async mode.
      execution: "async",
    },
  });

  if (convRes.isErr()) {
    logger.error(
      {
        error: convRes.error,
        stepContext,
      },
      "Failed to create conversation"
    );

    return new Err(new Error("Failed to create conversation"));
  }

  const { conversation, message: createdUserMessage } = convRes.value;

  if (!createdUserMessage) {
    return new Err(new Error("Failed to retrieve the created message."));
  }

  return new Ok({
    conversation,
    isNewConversation: true,
    userMessageId: createdUserMessage.sId,
  });
}
