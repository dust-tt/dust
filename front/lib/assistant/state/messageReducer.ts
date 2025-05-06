import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
import type {
  AgentActionSuccessEvent,
  AgentActionType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
} from "@app/types";
import { assertNever } from "@app/types";
import type { AgentMessageType } from "@app/types/assistant/conversation";

export type AgentStateClassification = "thinking" | "acting" | "done";

interface MessageTemporalState {
  message: AgentMessageType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: Map<
    number,
    {
      action: AgentActionType;
      progress?: ProgressNotificationContentType;
    }
  >;
}

export type AgentMessageStateEvent =
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | GenerationTokensEvent
  | ToolNotificationEvent;

function updateMessageWithAction(
  m: AgentMessageType,
  action: AgentActionType
): AgentMessageType {
  return {
    ...m,
    actions: m.actions
      ? [...m.actions.filter((a) => a.id !== action.id), action]
      : [action],
  };
}

export function messageReducer(
  state: MessageTemporalState,
  event: AgentMessageStateEvent
): MessageTemporalState {
  switch (event.type) {
    case "agent_action_success":
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        agentState: "thinking",
        // Clean up progress for this specific action.
        actionProgress: new Map(
          Array.from(state.actionProgress.entries()).filter(
            ([id]) => id !== event.action.id
          )
        ),
      };

    case "tool_notification": {
      const actionId = event.action.id;
      const currentProgress = state.actionProgress.get(actionId);

      // Update action progress
      const newState = {
        ...state,
        actionProgress: new Map(state.actionProgress).set(actionId, {
          action: event.action,
          progress: {
            ...currentProgress?.progress,
            ...event.notification,
            data: {
              ...currentProgress?.progress?.data,
              ...event.notification.data,
            },
          },
        }),
      };

      return newState;
    }

    case "agent_error":
      return {
        ...state,
        message: {
          ...state.message,
          status: "failed",
          error: event.error,
        },
        agentState: "done",
      };

    case "agent_generation_cancelled":
      return {
        ...state,
        message: {
          ...state.message,
          status: "cancelled",
        },
        agentState: "done",
      };

    case "agent_message_success":
      return {
        ...state,
        message: {
          ...state.message,
          ...event.message,
        },
        agentState: "done",
      };

    case "generation_tokens": {
      const newState = { ...state };
      switch (event.classification) {
        case "closing_delimiter":
        case "opening_delimiter":
          break;
        case "tokens":
          newState.message.content =
            (newState.message.content || "") + event.text;
          break;
        case "chain_of_thought":
          newState.message.chainOfThought =
            (newState.message.chainOfThought || "") + event.text;
          break;
        default:
          assertNever(event);
      }
      newState.agentState = "thinking";
      return newState;
    }

    case "browse_params":
    case "conversation_include_file_params":
    case "dust_app_run_block":
    case "dust_app_run_params":
    case "process_params":
    case "reasoning_started":
    case "reasoning_thinking":
    case "reasoning_tokens":
    case "retrieval_params":
    case "search_labels_params":
    case "tables_query_model_output":
    case "tables_query_output":
    case "tables_query_started":
    case "websearch_params":
    case "tool_params":
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        agentState: "acting",
      };

    case "tool_approve_execution":
      return state;

    default:
      assertNever(event);
  }
}
