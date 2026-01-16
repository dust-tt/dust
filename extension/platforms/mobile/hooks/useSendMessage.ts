import type {
  ConversationPublicType,
  PublicPostConversationsRequestBody,
  PublicPostMessagesRequestBody,
} from "@dust-tt/client";
import { useCallback, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import type { AgentMention } from "@/lib/services/api";
import { useDustAPI } from "@/lib/useDustAPI";

export type { AgentMention };

type SendMessageState = {
  isSending: boolean;
  error: string | null;
};

type SendMessageResult = {
  conversation: ConversationPublicType;
  userMessageId: string;
};

type UseSendMessageOptions = {
  onError?: (error: string) => void;
  onConversationCreated?: (conversationId: string) => void;
};

export function useSendMessage(options: UseSendMessageOptions = {}) {
  const { user, isAuthenticated } = useAuth();
  const dustAPI = useDustAPI({ disabled: !isAuthenticated });

  const [state, setState] = useState<SendMessageState>({
    isSending: false,
    error: null,
  });

  // Build message context - origin is sent via X-Request-Origin header, not in context
  const messageContext = useMemo(
    () => ({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      username: user?.username ?? "",
      email: user?.email ?? null,
      fullName: user?.fullName ?? null,
      profilePictureUrl: user?.image ?? null,
    }),
    [user]
  );

  const sendMessageToConversation = useCallback(
    async (
      conversationId: string,
      content: string,
      mentions: AgentMention[] = []
    ): Promise<SendMessageResult | null> => {
      if (!dustAPI) {
        setState((prev) => ({
          ...prev,
          error: "Not authenticated",
        }));
        return null;
      }

      setState({
        isSending: true,
        error: null,
      });

      const message: PublicPostMessagesRequestBody = {
        content,
        mentions,
        context: messageContext,
      };

      const result = await dustAPI.postUserMessage({ conversationId, message });

      if (result.isErr()) {
        setState({
          isSending: false,
          error: result.error.message,
        });
        options.onError?.(result.error.message);
        return null;
      }

      // Get the updated conversation (includes the new agent message)
      const convResult = await dustAPI.getConversation({ conversationId });

      setState({
        isSending: false,
        error: null,
      });

      if (convResult.isErr()) {
        setState((prev) => ({
          ...prev,
          error: convResult.error.message,
        }));
        return null;
      }

      return {
        conversation: convResult.value,
        userMessageId: result.value.sId,
      };
    },
    [dustAPI, messageContext, options]
  );

  const createConversationAndSend = useCallback(
    async (
      content: string,
      mentions: AgentMention[] = []
    ): Promise<SendMessageResult | null> => {
      if (!dustAPI) {
        setState((prev) => ({
          ...prev,
          error: "Not authenticated",
        }));
        return null;
      }

      setState({
        isSending: true,
        error: null,
      });

      const body: PublicPostConversationsRequestBody = {
        title: null,
        visibility: "unlisted",
        message: {
          content,
          mentions,
          context: messageContext,
        },
      };

      const result = await dustAPI.createConversation(body);

      setState({
        isSending: false,
        error: null,
      });

      if (result.isErr()) {
        setState((prev) => ({
          ...prev,
          error: result.error.message,
        }));
        options.onError?.(result.error.message);
        return null;
      }

      const { conversation, message } = result.value;

      options.onConversationCreated?.(conversation.sId);

      return {
        conversation,
        userMessageId: message.sId,
      };
    },
    [dustAPI, messageContext, options]
  );

  const resetState = useCallback(() => {
    setState({
      isSending: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    sendMessageToConversation,
    createConversationAndSend,
    resetState,
  };
}
