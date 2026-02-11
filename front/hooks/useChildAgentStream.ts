import { useCallback, useReducer } from "react";

import { useEventSource } from "@app/hooks/useEventSource";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { LightWorkspaceType } from "@app/types/user";

type ChildAgentStreamStatus = "created" | "streaming" | "done" | "error";

interface ChildAgentStreamState {
  content: string;
  chainOfThought: string;
  status: ChildAgentStreamStatus;
}

type ChildAgentStreamEvent =
  | (AgentMessageEvents & { step: number })
  | { type: "end-of-stream" };

const initialState: ChildAgentStreamState = {
  content: "",
  chainOfThought: "",
  status: "created",
};

function childAgentStreamReducer(
  state: ChildAgentStreamState,
  event: ChildAgentStreamEvent
): ChildAgentStreamState {
  switch (event.type) {
    case "generation_tokens": {
      if (event.classification === "tokens") {
        return {
          ...state,
          content: state.content + event.text,
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
      // opening_delimiter, closing_delimiter — no-op for content.
      return state;
    }

    case "agent_message_success":
      return {
        content: event.message.content ?? state.content,
        chainOfThought: event.message.chainOfThought ?? state.chainOfThought,
        status: "done",
      };

    case "agent_error":
    case "tool_error":
      return { ...state, status: "error" };

    case "agent_generation_cancelled":
      return { ...state, status: "done" };

    // Events we don't care about for the child stream display.
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
      return state;
  }
}

interface UseChildAgentStreamParams {
  conversationId: string | null;
  agentMessageId: string | null;
  owner: LightWorkspaceType;
}

// Minimalist implementation of a message stream, focused on textual content (COT + generation).
export function useChildAgentStream({
  conversationId,
  agentMessageId,
  owner,
}: UseChildAgentStreamParams): ChildAgentStreamState {
  const [state, dispatch] = useReducer(childAgentStreamReducer, initialState);

  const isReady = !!conversationId && !!agentMessageId;

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!conversationId || !agentMessageId) {
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
    [conversationId, agentMessageId, owner.sId]
  );

  const onEventCallback = useCallback((eventStr: string) => {
    const eventPayload: {
      eventId: string;
      data: ChildAgentStreamEvent;
    } = JSON.parse(eventStr);

    dispatch(eventPayload.data);
  }, []);

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `child-agent-${agentMessageId}`,
    { isReadyToConsumeStream: isReady }
  );

  return state;
}
