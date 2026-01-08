import { useCallback, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import type {
  AgentMention,
  CreateConversationRequest,
  MessageContext,
  PostMessageRequest,
} from "@/lib/services/api";
import { dustApi } from "@/lib/services/api";
import type { ConversationWithContent } from "@/lib/types/conversations";

type SendMessageState = {
  isSending: boolean;
  error: string | null;
};

type SendMessageResult = {
  conversation: ConversationWithContent;
  userMessageId: string;
};

type UseSendMessageOptions = {
  onError?: (error: string) => void;
  onConversationCreated?: (conversationId: string) => void;
};

export function useSendMessage(options: UseSendMessageOptions = {}) {
  const { user } = useAuth();
  const [state, setState] = useState<SendMessageState>({
    isSending: false,
    error: null,
  });

  const buildMessageContext = useCallback((): MessageContext => {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      username: user?.username ?? "",
      email: user?.email ?? null,
      fullName: user?.fullName ?? null,
      profilePictureUrl: user?.image ?? null,
      origin: "mobile",
    };
  }, [user]);

  const sendMessageToConversation = useCallback(
    async (
      conversationId: string,
      content: string,
      mentions: AgentMention[] = []
    ): Promise<SendMessageResult | null> => {
      if (!user?.dustDomain || !user?.selectedWorkspace) {
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

      const request: PostMessageRequest = {
        content,
        mentions,
        context: buildMessageContext(),
      };

      const result = await dustApi.postMessage(
        user.dustDomain,
        user.selectedWorkspace,
        conversationId,
        request
      );

      if (!result.isOk()) {
        setState({
          isSending: false,
          error: result.error.message,
        });
        options.onError?.(result.error.message);
        return null;
      }

      // Get the updated conversation (includes the new agent message)
      const convResult = await dustApi.getConversation(
        user.dustDomain,
        user.selectedWorkspace,
        conversationId
      );

      setState({
        isSending: false,
        error: null,
      });

      if (!convResult.isOk()) {
        setState((prev) => ({
          ...prev,
          error: convResult.error.message,
        }));
        return null;
      }

      return {
        conversation: convResult.value,
        userMessageId: result.value.message.sId,
      };
    },
    [user, buildMessageContext, options]
  );

  const createConversationAndSend = useCallback(
    async (
      content: string,
      mentions: AgentMention[] = []
    ): Promise<SendMessageResult | null> => {
      if (!user?.dustDomain || !user?.selectedWorkspace) {
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

      const request: CreateConversationRequest = {
        title: null,
        visibility: "unlisted",
        message: {
          content,
          mentions,
          context: buildMessageContext(),
        },
      };

      const result = await dustApi.createConversation(
        user.dustDomain,
        user.selectedWorkspace,
        request
      );

      setState({
        isSending: false,
        error: null,
      });

      if (!result.isOk()) {
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
    [user, buildMessageContext, options]
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
