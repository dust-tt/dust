import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import type {
  AgentMention,
  CreateConversationRequest,
  MessageContext,
  PostMessageRequest,
} from "@/lib/services/api";
import { dustApi } from "@/lib/services/api";
import type { AgentMessage, ConversationWithContent } from "@/lib/types/conversations";

type SendMessageState = {
  isSending: boolean;
  isStreaming: boolean;
  error: string | null;
  streamingContent: string;
  streamingMessage: AgentMessage | null;
};

type SendMessageResult = {
  conversation: ConversationWithContent;
  userMessageId: string;
};

type UseSendMessageOptions = {
  onStreamUpdate?: (content: string, message: AgentMessage | null) => void;
  onStreamComplete?: (message: AgentMessage) => void;
  onError?: (error: string) => void;
  onConversationCreated?: (conversationId: string) => void;
};

export function useSendMessage(options: UseSendMessageOptions = {}) {
  const { user } = useAuth();
  const [state, setState] = useState<SendMessageState>({
    isSending: false,
    isStreaming: false,
    error: null,
    streamingContent: "",
    streamingMessage: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageRef = useRef<AgentMessage | null>(null);

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

  const streamAnswer = useCallback(
    async (
      conversationId: string,
      userMessageId: string,
      signal: AbortSignal
    ): Promise<AgentMessage | null> => {
      if (!user?.dustDomain || !user?.selectedWorkspace) {
        return null;
      }

      let content = "";
      let finalMessage: AgentMessage | null = null;
      streamingMessageRef.current = null;

      setState((prev) => ({
        ...prev,
        isStreaming: true,
        streamingContent: "",
        streamingMessage: null,
      }));

      try {
        const stream = dustApi.streamAgentAnswer(
          user.dustDomain,
          user.selectedWorkspace,
          conversationId,
          userMessageId,
          signal
        );

        for await (const event of stream) {
          switch (event.type) {
            case "agent_message_new":
              streamingMessageRef.current = event.message;
              setState((prev) => ({
                ...prev,
                streamingMessage: event.message,
              }));
              options.onStreamUpdate?.(content, event.message);
              break;

            case "generation_tokens":
              if (event.classification === "tokens") {
                content += event.text;
                const currentMessage = streamingMessageRef.current;
                setState((prev) => ({
                  ...prev,
                  streamingContent: content,
                  streamingMessage: currentMessage
                    ? { ...currentMessage, content }
                    : null,
                }));
                options.onStreamUpdate?.(
                  content,
                  currentMessage ? { ...currentMessage, content } : null
                );
              }
              break;

            case "agent_message_success":
              finalMessage = event.message;
              streamingMessageRef.current = event.message;
              setState((prev) => ({
                ...prev,
                streamingContent: event.message.content ?? "",
                streamingMessage: event.message,
              }));
              options.onStreamComplete?.(event.message);
              break;

            case "agent_error":
            case "user_message_error":
              setState((prev) => ({
                ...prev,
                error: event.error.message,
              }));
              options.onError?.(event.error.message);
              break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          const errorMessage = err.message || "Stream failed";
          setState((prev) => ({
            ...prev,
            error: errorMessage,
          }));
          options.onError?.(errorMessage);
        }
      } finally {
        streamingMessageRef.current = null;
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }));
      }

      return finalMessage;
    },
    [user, options]
  );

  const sendMessageToConversation = useCallback(
    async (
      conversationId: string,
      content: string,
      mentions: AgentMention[] = [],
    ): Promise<SendMessageResult | null> => {
      if (!user?.dustDomain || !user?.selectedWorkspace) {
        setState((prev) => ({
          ...prev,
          error: "Not authenticated",
        }));
        return null;
      }

      abortControllerRef.current = new AbortController();

      setState({
        isSending: true,
        isStreaming: false,
        error: null,
        streamingContent: "",
        streamingMessage: null,
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
        setState((prev) => ({
          ...prev,
          isSending: false,
          error: result.error.message,
        }));
        options.onError?.(result.error.message);
        return null;
      }

      // Get the updated conversation
      const convResult = await dustApi.getConversation(
        user.dustDomain,
        user.selectedWorkspace,
        conversationId
      );

      setState((prev) => ({
        ...prev,
        isSending: false,
      }));

      if (!convResult.isOk()) {
        setState((prev) => ({
          ...prev,
          error: convResult.error.message,
        }));
        return null;
      }

      // Start streaming the answer using the first agent message's sId
      const agentMessage = result.value.agentMessages?.[0];
      if (agentMessage) {
        void streamAnswer(
          conversationId,
          agentMessage.sId,
          abortControllerRef.current.signal
        );
      }

      return {
        conversation: convResult.value,
        userMessageId: result.value.message.sId,
      };
    },
    [user, buildMessageContext, streamAnswer, options]
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

      abortControllerRef.current = new AbortController();

      setState({
        isSending: true,
        isStreaming: false,
        error: null,
        streamingContent: "",
        streamingMessage: null,
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

      setState((prev) => ({
        ...prev,
        isSending: false,
      }));

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

      // Find the agent message that's responding to our user message
      const agentMessage = conversation.content
        .flat()
        .find(
          (m): m is AgentMessage =>
            m.type === "agent_message"
        );

      // Start streaming the answer using the agent message's sId
      if (agentMessage) {
        void streamAnswer(
          conversation.sId,
          agentMessage.sId,
          abortControllerRef.current.signal
        );
      }

      return {
        conversation,
        userMessageId: message.sId,
      };
    },
    [user, buildMessageContext, streamAnswer, options]
  );

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }));
  }, []);

  const resetState = useCallback(() => {
    setState({
      isSending: false,
      isStreaming: false,
      error: null,
      streamingContent: "",
      streamingMessage: null,
    });
  }, []);

  return {
    ...state,
    sendMessageToConversation,
    createConversationAndSend,
    cancelStream,
    resetState,
  };
}
