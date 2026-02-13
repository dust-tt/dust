import { useEventSource } from "@app/hooks/useEventSource";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useReducer } from "react";

type ChildAgentStreamStatus = "created" | "streaming" | "done" | "error";

interface ChildAgentStreamReducerState {
  response: string;
  chainOfThought: string;
  status: ChildAgentStreamStatus;
}

interface ChildAgentStreamResult {
  response: string;
  chainOfThought: string;
  isStreamingChainOfThought: boolean;
  isStreamingResponse: boolean;
}

type ChildAgentStreamEvent = AgentMessageEvents | { type: "end-of-stream" };

const initialState: ChildAgentStreamReducerState = {
  response: "",
  chainOfThought: "",
  status: "created",
};

function childAgentStreamReducer(
  state: ChildAgentStreamReducerState,
  event: ChildAgentStreamEvent
): ChildAgentStreamReducerState {
  switch (event.type) {
    case "generation_tokens": {
      if (event.classification === "tokens") {
        return {
          ...state,
          response: state.response + event.text,
          status: "streaming",
        };
      }
      if (event.classification === "chain_of_thought") {
        return {
          ...state,
          chainOfThought: state.chainOfThought + event.text,
          status: "streaming",
        };
      }
      // opening_delimiter and closing_delimiter we don't rely on.
      return state;
    }

    case "agent_message_success":
      return {
        response: event.message.content ?? state.response,
        chainOfThought: event.message.chainOfThought ?? state.chainOfThought,
        status: "done",
      };

    case "agent_error":
    case "tool_error":
      return { ...state, status: "error" };

    case "agent_generation_cancelled":
      return { ...state, status: "done" };

    // Events we don't use for the child stream display.
    case "end-of-stream":
    case "agent_action_success":
    case "tool_params":
    case "tool_notification":
    case "agent_context_pruned":
    case "tool_approve_execution":
    case "tool_personal_auth_required":
    case "tool_file_auth_required":
      return state;

    default:
      assertNever(event);
  }
}

interface UseChildAgentStreamParams {
  conversationId: string | null;
  agentMessageId: string | null;
  owner: LightWorkspaceType;
  disabled: boolean;
}

// Minimalist implementation of a message stream, focused on textual content (COT + generation).
export function useChildAgentStream({
  conversationId,
  agentMessageId,
  owner,
  disabled,
}: UseChildAgentStreamParams): ChildAgentStreamResult {
  const [state, dispatch] = useReducer(childAgentStreamReducer, initialState);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!conversationId || !agentMessageId || disabled) {
        return null;
      }
      const baseUrl = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${agentMessageId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: { eventId: string } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      return baseUrl + "?lastEventId=" + lastEventId;
    },
    [conversationId, agentMessageId, owner.sId, disabled]
  );

  const onEventCallback = useCallback((eventStr: string) => {
    const eventPayload: {
      eventId: string;
      data: ChildAgentStreamEvent;
    } = JSON.parse(eventStr);

    dispatch(eventPayload.data);
  }, []);

  const isStreamDone = state.status === "done" || state.status === "error";

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `child-agent-${agentMessageId}`,
    {
      isReadyToConsumeStream:
        conversationId !== null &&
        agentMessageId !== null &&
        !isStreamDone &&
        !disabled,
    }
  );

  const isStreaming = state.status === "streaming";

  return {
    response: state.response,
    chainOfThought: state.chainOfThought,
    isStreamingChainOfThought: isStreaming && state.response.length === 0,
    isStreamingResponse: isStreaming && state.response.length > 0,
  };
}
