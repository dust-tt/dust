import type {
  AgentActionPublicType,
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessagePublicType,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  ToolErrorEvent,
  ToolNotificationEvent,
  ToolNotificationProgress,
} from "@dust-tt/client";
import { assertNever } from "@dust-tt/client";

export type AgentStateClassification =
  | "thinking"
  | "acting"
  | "writing"
  | "done";

export type ActionProgressState = Map<
  number,
  {
    action: AgentActionPublicType;
    progress?: ToolNotificationProgress;
  }
>;
export interface MessageTemporaryState {
  message: AgentMessagePublicType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: ActionProgressState;
}

export type AgentMessageStateEvent =
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | GenerationTokensEvent
  | ToolErrorEvent
  | ToolNotificationEvent;

type AgentMessageStateEventWithoutToolApproveExecution = Exclude<
  AgentMessageStateEvent,
  { type: "tool_approve_execution" }
>;

function updateMessageWithAction(
  m: AgentMessagePublicType,
  action: AgentActionPublicType
): AgentMessagePublicType {
  return {
    ...m,
    actions: [...m.actions.filter((a) => a.id !== action.id), action],
  };
}

function updateProgress(
  state: MessageTemporaryState,
  event: ToolNotificationEvent
): MessageTemporaryState {
  const actionId = event.action.id;
  const currentProgress = state.actionProgress.get(actionId);

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

export function messageReducer(
  state: MessageTemporaryState,
  event: AgentMessageStateEventWithoutToolApproveExecution
): MessageTemporaryState {
  switch (event.type) {
    case "agent_action_success":
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        // Clean up progress for this specific action.
        actionProgress: new Map(
          Array.from(state.actionProgress.entries()).filter(
            ([id]) => id !== event.action.id
          )
        ),
      };

    case "tool_notification": {
      return updateProgress(state, event);
    }

    case "tool_error":
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
        message: event.message,
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
          newState.agentState = "writing";

          break;
        case "chain_of_thought":
          newState.message.chainOfThought =
            (newState.message.chainOfThought || "") + event.text;
          newState.agentState = "thinking";

          break;
      }
      return newState;
    }
    case "tool_params":
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        agentState: "acting",
      };

    default:
      assertNever(event);
  }
}
