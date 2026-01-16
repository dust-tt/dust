import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";
import { parseSSEMessages } from "@/lib/sse-parser";

const authService = new MobileAuthService(storageService);

type ConversationEventType =
  | "user_message_new"
  | "agent_message_new"
  | "agent_message_success"
  | "generation_tokens"
  | "agent_error"
  | "conversation_title";

interface ConversationEvent {
  type: ConversationEventType;
  data: unknown;
}

interface UseConversationEventsOptions {
  conversationId: string | null;
  onEvent?: (event: ConversationEvent) => void;
  onNewMessage?: () => void;
}

/**
 * Subscribe to real-time conversation events via SSE.
 * This allows the mobile app to receive updates when messages are
 * sent from other devices (e.g., web interface).
 */
export function useConversationEvents({
  conversationId,
  onEvent,
  onNewMessage,
}: UseConversationEventsOptions) {
  const { user } = useAuth();
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectedRef = useRef(false);

  const connect = useCallback(async () => {
    if (!user?.dustDomain || !user?.selectedWorkspace || !conversationId) {
      return;
    }

    const accessToken = await authService.getAccessToken();
    if (!accessToken) {
      return;
    }

    // Clean up existing connection
    if (xhrRef.current) {
      xhrRef.current.abort();
    }

    const baseUrl = `${user.dustDomain}/api/v1/w/${user.selectedWorkspace}/assistant/conversations/${conversationId}/events`;
    const url = lastEventIdRef.current
      ? `${baseUrl}?lastEventId=${lastEventIdRef.current}`
      : baseUrl;

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open("GET", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");

    let buffer = "";
    let lastProcessedIndex = 0;

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      buffer += newData;

      // Parse SSE messages
      const messages = parseSSEMessages(buffer);
      const lastNewline = buffer.lastIndexOf("\n\n");
      if (lastNewline !== -1) {
        buffer = buffer.substring(lastNewline + 2);
      }

      for (const msg of messages) {
        if (!msg.data || msg.data === "[DONE]" || msg.data === "done") {
          continue;
        }

        try {
          const parsed = JSON.parse(msg.data);

          // Track event ID for reconnection
          if (parsed.eventId) {
            lastEventIdRef.current = parsed.eventId;
          }

          const eventData = parsed.data || parsed;
          const eventType = eventData.type as ConversationEventType;

          onEvent?.({ type: eventType, data: eventData });

          // Notify on new messages (from any source)
          if (
            eventType === "user_message_new" ||
            eventType === "agent_message_new" ||
            eventType === "agent_message_success"
          ) {
            onNewMessage?.();
          }
        } catch {
          // Skip unparseable messages
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.OPENED) {
        isConnectedRef.current = true;
        reconnectAttemptsRef.current = 0;
      }
    };

    xhr.onerror = () => {
      isConnectedRef.current = false;
      scheduleReconnect();
    };

    xhr.onload = () => {
      isConnectedRef.current = false;
      // Connection closed normally, reconnect to continue listening
      scheduleReconnect();
    };

    xhr.send();
  }, [user?.dustDomain, user?.selectedWorkspace, conversationId, onEvent, onNewMessage]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectAttemptsRef.current++;

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptsRef.current - 1),
      30000
    );

    if (reconnectAttemptsRef.current <= 10) {
      reconnectTimeoutRef.current = setTimeout(() => {
        void connect();
      }, delay);
    }
  }, [connect]);

  const disconnect = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectedRef.current = false;
    reconnectAttemptsRef.current = 0;
  }, []);

  useEffect(() => {
    if (conversationId) {
      void connect();
    }

    return () => {
      disconnect();
    };
  }, [conversationId, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    disconnect,
    reconnect: connect,
  };
}
