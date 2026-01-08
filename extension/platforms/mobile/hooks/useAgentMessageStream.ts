import { useCallback, useEffect, useReducer, useRef } from "react";

import { useAuth } from "@/contexts/AuthContext";
import type { AgentMessage } from "@/lib/types/conversations";
import { streamAgentAnswerRN } from "@/lib/services/streaming";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";

type AgentState = "thinking" | "acting" | "writing" | "done";

interface MessageStreamState {
  message: AgentMessage;
  agentState: AgentState;
}

type StreamAction =
  | { type: "generation_tokens"; text: string; classification: "tokens" | "chain_of_thought" }
  | { type: "agent_message_success"; message: AgentMessage }
  | { type: "agent_error"; error: { code: string; message: string } }
  | { type: "reset"; message: AgentMessage };

function messageReducer(
  state: MessageStreamState,
  action: StreamAction
): MessageStreamState {
  switch (action.type) {
    case "generation_tokens": {
      if (action.classification === "tokens") {
        return {
          ...state,
          message: {
            ...state.message,
            content: (state.message.content || "") + action.text,
          },
          agentState: "writing",
        };
      }
      // chain_of_thought - we could track this separately if needed
      return { ...state, agentState: "thinking" };
    }

    case "agent_message_success":
      return {
        ...state,
        message: action.message,
        agentState: "done",
      };

    case "agent_error":
      return {
        ...state,
        message: {
          ...state.message,
          status: "failed",
          error: action.error,
        },
        agentState: "done",
      };

    case "reset":
      return {
        message: action.message,
        agentState: action.message.status === "created" ? "thinking" : "done",
      };

    default:
      return state;
  }
}

function makeInitialState(message: AgentMessage): MessageStreamState {
  return {
    message,
    agentState: message.status === "created" ? "thinking" : "done",
  };
}

const authService = new MobileAuthService(storageService);

interface UseAgentMessageStreamOptions {
  conversationId: string;
  onStreamComplete?: (message: AgentMessage) => void;
}

export function useAgentMessageStream(
  message: AgentMessage,
  options: UseAgentMessageStreamOptions
) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(
    messageReducer,
    message,
    makeInitialState
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const hasStartedStreamingRef = useRef(false);
  const messageIdRef = useRef(message.sId);

  // Use refs to avoid re-creating startStreaming on every render
  const conversationIdRef = useRef(options.conversationId);
  const onStreamCompleteRef = useRef(options.onStreamComplete);
  const userRef = useRef(user);

  // Keep refs updated
  useEffect(() => {
    conversationIdRef.current = options.conversationId;
    onStreamCompleteRef.current = options.onStreamComplete;
    userRef.current = user;
  });

  // Reset state if message changes (e.g., from server refresh)
  useEffect(() => {
    if (message.sId !== messageIdRef.current) {
      messageIdRef.current = message.sId;
      hasStartedStreamingRef.current = false;
      dispatch({ type: "reset", message });
    } else if (message.status === "succeeded" && state.message.status !== "succeeded") {
      // Server returned final message, update state
      dispatch({ type: "reset", message });
    }
  }, [message, state.message.status]);

  const shouldStream = message.status === "created" && !hasStartedStreamingRef.current;

  const startStreaming = useCallback(async () => {
    const currentUser = userRef.current;

    if (!currentUser?.dustDomain || !currentUser?.selectedWorkspace) {
      return;
    }

    hasStartedStreamingRef.current = true;
    abortControllerRef.current = new AbortController();

    try {
      const stream = streamAgentAnswerRN(
        currentUser.dustDomain,
        currentUser.selectedWorkspace,
        conversationIdRef.current,
        message.sId,
        () => authService.getAccessToken(),
        abortControllerRef.current.signal
      );

      for await (const event of stream) {
        switch (event.type) {
          case "generation_tokens":
            dispatch({
              type: "generation_tokens",
              text: event.text,
              classification: event.classification,
            });
            break;

          case "agent_message_success":
            dispatch({ type: "agent_message_success", message: event.message });
            onStreamCompleteRef.current?.(event.message);
            break;

          case "agent_error":
          case "user_message_error":
            dispatch({ type: "agent_error", error: event.error });
            break;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        dispatch({
          type: "agent_error",
          error: { code: "stream_error", message: err.message },
        });
      }
    }
  }, [message.sId]);

  // Start streaming when message is in "created" status
  useEffect(() => {
    if (shouldStream) {
      void startStreaming();
    }
  }, [shouldStream, startStreaming]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    message: state.message,
    agentState: state.agentState,
    isStreaming: state.agentState !== "done",
    cancelStream,
  };
}
