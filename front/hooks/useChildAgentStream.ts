import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import {
  removePendingToolCallForAction,
  upsertPendingToolCall,
} from "@app/hooks/useAgentMessageStream";
import { useEventSource } from "@app/hooks/useEventSource";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useReducer } from "react";

type ChildAgentStreamStatus = "created" | "streaming" | "done" | "error";

interface ChildAgentStreamReducerState {
  response: string;
  cotBuffer: string;
  status: ChildAgentStreamStatus;
  inlineActivitySteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
}

interface ChildAgentStreamResult {
  response: string;
  isStreamingResponse: boolean;
  inlineActivitySteps: InlineActivityStep[];
  pendingToolCalls: PendingToolCall[];
  activeCotContent: string;
  isDone: boolean;
  isError: boolean;
}

type ChildAgentStreamEvent = AgentMessageEvents | { type: "end-of-stream" };

const initialState: ChildAgentStreamReducerState = {
  response: "",
  cotBuffer: "",
  status: "created",
  inlineActivitySteps: [],
  pendingToolCalls: [],
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
          cotBuffer: state.cotBuffer + event.text,
          status: "streaming",
        };
      }
      // opening_delimiter and closing_delimiter we don't rely on.
      return state;
    }

    case "tool_params": {
      // Flush accumulated CoT to a thinking step when the tool starts executing.
      const trimmedCot = state.cotBuffer.trim();
      const newSteps: InlineActivityStep[] = trimmedCot
        ? [
            ...state.inlineActivitySteps,
            {
              type: "thinking" as const,
              content: trimmedCot,
              id: `thinking-${event.created}`,
            },
          ]
        : state.inlineActivitySteps;
      return {
        ...state,
        cotBuffer: "",
        inlineActivitySteps: newSteps,
      };
    }

    case "tool_call_started": {
      return {
        ...state,
        pendingToolCalls: upsertPendingToolCall(state.pendingToolCalls, {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          toolCallIndex: event.toolCallIndex,
        }),
      };
    }

    case "agent_action_success": {
      const { action } = event;
      return {
        ...state,
        pendingToolCalls: removePendingToolCallForAction(
          state.pendingToolCalls,
          action
        ),
        inlineActivitySteps: [
          ...state.inlineActivitySteps,
          {
            type: "action" as const,
            label: getActionOneLineLabel(action, "done"),
            id: `action-${action.id}`,
            actionId: action.sId,
            internalMCPServerName: action.internalMCPServerName,
            toolName: action.toolName,
          },
        ],
      };
    }

    case "agent_message_gracefully_stopped":
    case "agent_message_success": {
      // Flush any remaining CoT buffer as a final thinking step.
      const trimmedCot = state.cotBuffer.trim();
      const finalSteps: InlineActivityStep[] = trimmedCot
        ? [
            ...state.inlineActivitySteps,
            {
              type: "thinking" as const,
              content: trimmedCot,
              id: `thinking-final-${event.created}`,
            },
          ]
        : state.inlineActivitySteps;
      return {
        response: event.message.content ?? state.response,
        cotBuffer: "",
        inlineActivitySteps: finalSteps,
        pendingToolCalls: [],
        status: "done",
      };
    }

    case "agent_error":
    case "tool_error":
      return { ...state, cotBuffer: "", pendingToolCalls: [], status: "error" };

    case "agent_generation_cancelled":
      return { ...state, cotBuffer: "", pendingToolCalls: [], status: "done" };

    // Events we don't use for the child stream display.
    case "end-of-stream":
    case "tool_notification":
    case "agent_context_pruned":
    case "tool_approve_execution":
    case "tool_personal_auth_required":
    case "tool_file_auth_required":
    case "tool_ask_user_question":
      return state;

    default:
      assertNeverAndIgnore(event);
      return state;
  }
}

interface UseChildAgentStreamParams {
  childStreamIds: {
    conversationId: string;
    agentMessageId: string;
  } | null;
  owner: LightWorkspaceType;
  disabled: boolean;
}

// Stream the child agent's conversation: textual content (CoT + generation) and tool call activity.
export function useChildAgentStream({
  childStreamIds,
  owner,
  disabled,
}: UseChildAgentStreamParams): ChildAgentStreamResult {
  const [state, dispatch] = useReducer(childAgentStreamReducer, initialState);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!childStreamIds || disabled) {
        return null;
      }
      const { conversationId, agentMessageId } = childStreamIds;
      const baseUrl = `/api/sse/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${agentMessageId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: { eventId: string } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      return baseUrl + "?lastEventId=" + lastEventId;
    },
    [childStreamIds, owner.sId, disabled]
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
    `child-agent-${childStreamIds?.agentMessageId}`,
    {
      isReadyToConsumeStream:
        childStreamIds !== null && !isStreamDone && !disabled,
    }
  );

  const isStreaming = state.status === "streaming";

  return {
    response: state.response,
    isStreamingResponse: isStreaming && state.response.length > 0,
    inlineActivitySteps: state.inlineActivitySteps,
    pendingToolCalls: state.pendingToolCalls,
    activeCotContent: state.cotBuffer,
    isDone: isStreamDone,
    isError: state.status === "error",
  };
}
