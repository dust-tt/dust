import { useState, useRef, useCallback, useEffect } from "react";
import type { AgentMessagePublicType } from "@dust-tt/client";
import { useAuthContext } from "../context/AuthContext";
import { connectMessageStream, buildMessageEventsUrl } from "../lib/sseStream";
import { messageReducer, createInitialState } from "../lib/messageReducer";
import type { MessageTemporaryState } from "../types";
import { useDustAPI } from "./useDustAPI";

const TOKEN_THROTTLE_MS = 50;

type StreamingState = {
  isStreaming: boolean;
  state: MessageTemporaryState | null;
  error: Error | null;
};

export function useStreamingMessage() {
  const { user, selectedWorkspace } = useAuthContext();
  const dustAPI = useDustAPI();
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    state: null,
    error: null,
  });

  const streamHandle = useRef<{ close: () => void } | null>(null);
  const tokenBuffer = useRef("");
  const tokenFlushTimer = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<MessageTemporaryState | null>(null);

  const flushTokens = useCallback(() => {
    if (tokenBuffer.current && stateRef.current) {
      const event = {
        type: "generation_tokens" as const,
        classification: "tokens",
        text: tokenBuffer.current,
      };
      const newState = messageReducer(stateRef.current, event);
      stateRef.current = newState;
      setStreamingState((s) => ({ ...s, state: newState }));
      tokenBuffer.current = "";
    }
  }, []);

  const startStreaming = useCallback(
    (conversationId: string, agentMessage: AgentMessagePublicType) => {
      if (!user || !selectedWorkspace) return;

      // Clean up any existing stream
      streamHandle.current?.close();
      if (tokenFlushTimer.current) {
        clearInterval(tokenFlushTimer.current);
      }

      const initialState = createInitialState(agentMessage);
      stateRef.current = initialState;
      setStreamingState({
        isStreaming: true,
        state: initialState,
        error: null,
      });

      const url = buildMessageEventsUrl(
        user.dustDomain,
        selectedWorkspace.sId,
        conversationId,
        agentMessage.sId
      );

      // Set up token throttle flush
      tokenFlushTimer.current = setInterval(flushTokens, TOKEN_THROTTLE_MS);

      const handle = connectMessageStream({
        url,
        onEvent: (eventData) => {
          const event = eventData as { type: string; [key: string]: unknown };

          // Buffer generation tokens for throttling
          if (
            event.type === "generation_tokens" &&
            event.classification === "tokens"
          ) {
            tokenBuffer.current += event.text as string;
            return;
          }

          // Chain of thought tokens — also throttle
          if (
            event.type === "generation_tokens" &&
            event.classification === "chain_of_thought"
          ) {
            if (stateRef.current) {
              const newState = messageReducer(stateRef.current, event);
              stateRef.current = newState;
              setStreamingState((s) => ({ ...s, state: newState }));
            }
            return;
          }

          // Tool approval events — show message to use web app
          if (
            event.type === "tool_approve_execution" ||
            event.type === "tool_personal_auth_required"
          ) {
            setStreamingState((s) => ({
              ...s,
              error: new Error(
                "This agent requires action approval. Please use the web app to continue."
              ),
            }));
            return;
          }

          // All other events — flush tokens first, then process
          flushTokens();
          if (stateRef.current) {
            const newState = messageReducer(stateRef.current, event);
            stateRef.current = newState;
            setStreamingState((s) => ({ ...s, state: newState }));
          }
        },
        onDone: () => {
          flushTokens();
          if (tokenFlushTimer.current) {
            clearInterval(tokenFlushTimer.current);
          }
          setStreamingState((s) => ({ ...s, isStreaming: false }));
        },
        onError: (error) => {
          flushTokens();
          if (tokenFlushTimer.current) {
            clearInterval(tokenFlushTimer.current);
          }
          setStreamingState((s) => ({
            ...s,
            isStreaming: false,
            error,
          }));
        },
      });

      streamHandle.current = handle;
    },
    [user, selectedWorkspace, flushTokens]
  );

  const cancelStreaming = useCallback(
    async (conversationId: string, messageId: string) => {
      streamHandle.current?.close();
      if (tokenFlushTimer.current) {
        clearInterval(tokenFlushTimer.current);
      }
      flushTokens();
      setStreamingState((s) => ({ ...s, isStreaming: false }));

      try {
        await dustAPI.cancelMessageGeneration({
          conversationId,
          messageIds: [messageId],
        });
      } catch {
        // Best effort cancel
      }
    },
    [dustAPI, flushTokens]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamHandle.current?.close();
      if (tokenFlushTimer.current) {
        clearInterval(tokenFlushTimer.current);
      }
    };
  }, []);

  return {
    ...streamingState,
    startStreaming,
    cancelStreaming,
  };
}
