import type { ConversationPublicType, DustAPI, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type { ChildAgentBlob } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import { isRunAgentResumeState } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
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
  }: {
    childAgentBlob: ChildAgentBlob;
    childAgentId: string;
    mainAgent: AgentConfigurationType;
    mainConversation: ConversationType;
    query: string;
    toolsetsToAdd: string[] | null;
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

  const convRes = await api.createConversation({
    title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: query,
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
