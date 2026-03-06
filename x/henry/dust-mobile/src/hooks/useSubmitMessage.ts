import { useState, useCallback } from "react";
import { useDustAPI } from "./useDustAPI";
import { useStreamingMessage } from "./useStreamingMessage";
import { useAuthContext } from "../context/AuthContext";
import type {
  AgentMessagePublicType,
  AgentMentionType,
  ConversationPublicType,
} from "@dust-tt/client";

type SubmitState = {
  isSubmitting: boolean;
  error: string | null;
};

const POLL_DELAYS = [500, 1000, 2000, 2000, 3000];

export function useSubmitMessage(
  conversationId: string | undefined,
  onConversationCreated?: (conversation: ConversationPublicType) => void
) {
  const dustAPI = useDustAPI();
  const { user } = useAuthContext();
  const streaming = useStreamingMessage();
  const [submitState, setSubmitState] = useState<SubmitState>({
    isSubmitting: false,
    error: null,
  });

  const submit = useCallback(
    async (content: string, mentions: AgentMentionType[]) => {
      if (!user) return;

      setSubmitState({ isSubmitting: true, error: null });

      const messageContext = {
        username: user.username ?? user.firstName ?? "user",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        fullName: user.fullName ?? null,
        email: user.email ?? null,
        profilePictureUrl: user.image ?? null,
        origin: "api" as const,
      };

      try {
        if (!conversationId) {
          // Create new conversation
          const result = await dustAPI.createConversation({
            visibility: "unlisted",
            message: {
              content,
              mentions,
              context: messageContext,
            },
            blocking: false,
          });

          if (result.isErr()) {
            setSubmitState({
              isSubmitting: false,
              error: result.error.message,
            });
            return;
          }

          const { conversation, message: userMessage } = result.value;
          onConversationCreated?.(conversation);

          // Find the agent message that was created in response
          const agentMessage = userMessage
            ? findAgentMessage(conversation, userMessage.sId)
            : null;

          if (agentMessage) {
            streaming.startStreaming(conversation.sId, agentMessage);
          }
        } else {
          // Post to existing conversation
          const result = await dustAPI.postUserMessage({
            conversationId,
            message: {
              content,
              mentions,
              context: messageContext,
            },
          });

          if (result.isErr()) {
            setSubmitState({
              isSubmitting: false,
              error: result.error.message,
            });
            return;
          }

          const userMessage = result.value;

          // Poll for agent message creation
          const agentMessage = await pollForAgentMessage(
            conversationId,
            userMessage.sId
          );

          if (agentMessage) {
            streaming.startStreaming(conversationId, agentMessage);
          } else {
            setSubmitState({
              isSubmitting: false,
              error: "Agent did not respond. Please try again.",
            });
            return;
          }
        }

        setSubmitState({ isSubmitting: false, error: null });
      } catch (e) {
        setSubmitState({
          isSubmitting: false,
          error: e instanceof Error ? e.message : "Failed to send message",
        });
      }
    },
    [conversationId, dustAPI, user, streaming, onConversationCreated]
  );

  async function pollForAgentMessage(
    convId: string,
    userMessageSId: string
  ): Promise<AgentMessagePublicType | null> {
    for (const delay of POLL_DELAYS) {
      await sleep(delay);

      const result = await dustAPI.getConversation({
        conversationId: convId,
      });

      if (result.isErr()) continue;

      const conversation = result.value;
      const agentMessage = findAgentMessage(conversation, userMessageSId);
      if (agentMessage && agentMessage.status === "created") {
        return agentMessage;
      }
    }
    return null;
  }

  return {
    submit,
    ...submitState,
    streaming,
  };
}

function findAgentMessage(
  conversation: ConversationPublicType,
  userMessageSId: string
): AgentMessagePublicType | null {
  for (const versions of conversation.content) {
    const latest = versions[versions.length - 1];
    if (
      latest.type === "agent_message" &&
      latest.parentMessageId === userMessageSId
    ) {
      return latest;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
