import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { LightAgentMessageWithActionsType, ModelId } from "@app/types";
import { assertNever } from "@app/types";
import type {
  AgentMCPActionType,
  AgentMCPActionWithOutputType,
} from "@app/types/actions";

export type AgentStateClassification =
  | "thinking"
  | "acting"
  | "writing"
  | "done";

export type ActionProgressState = Map<
  ModelId,
  {
    action: AgentMCPActionType;
    progress?: ProgressNotificationContentType;
  }
>;

export interface MessageTemporaryState {
  message: LightAgentMessageWithActionsType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: ActionProgressState;
  useFullChainOfThought: boolean;
}

export type AgentMessageStateEvent = (
  | AgentMessageEvents
  | ToolNotificationEvent
) & { step: number };

type AgentMessageStateEventWithoutToolApproveExecution = Exclude<
  AgentMessageStateEvent,
  { type: "tool_approve_execution" }
>;

function updateMessageWithAction(
  m: LightAgentMessageWithActionsType,
  action: AgentMCPActionWithOutputType
): LightAgentMessageWithActionsType {
  return {
    ...m,
    chainOfThought: "",
    actions: [...m.actions.filter((a) => a.id !== action.id), action],
  };
}

function updateProgress(
  state: MessageTemporaryState,
  event: ToolNotificationEvent
): MessageTemporaryState {
  const actionId = event.action.id;
  const currentProgress = state.actionProgress.get(actionId);

  return {
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
}

export const CLEAR_CONTENT_EVENT = { type: "clear_content" as const };
export const RETRY_BLOCKED_ACTIONS_STARTED_EVENT = {
  type: "retry_blocked_actions_started" as const,
};

export type ClearContentEvent = typeof CLEAR_CONTENT_EVENT;
export type RetryBlockedActionsStartedEvent =
  typeof RETRY_BLOCKED_ACTIONS_STARTED_EVENT;

export function messageReducer(
  state: MessageTemporaryState,
  event:
    | AgentMessageStateEventWithoutToolApproveExecution
    | ClearContentEvent
    | RetryBlockedActionsStartedEvent
): MessageTemporaryState {
  switch (event.type) {
    case "clear_content":
      return {
        ...state,
        message: {
          ...state.message,
          content: null,
          chainOfThought: null,
        },
      };

    case "retry_blocked_actions_started":
      return {
        ...state,
        message: {
          ...state.message,
          status: "created",
          error: null,
        },
        // Reset the agent state to "acting" to allow for streaming to continue.
        agentState: "acting",
      };

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
        message: {
          ...getLightAgentMessageFromAgentMessage(event.message),
          actions: state.message.actions,
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            (newState.message.content || "") + event.text;
          newState.agentState = "writing";
          break;
        case "chain_of_thought":
          // If we're not using the full chain of thought, reset at paragraph boundaries.
          if (!state.useFullChainOfThought && event.text === "\n\n") {
            newState.message.chainOfThought = "";
          } else {
            newState.message.chainOfThought =
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              (newState.message.chainOfThought || "") + event.text;
          }
          newState.agentState = "thinking";
          break;
        default:
          assertNever(event);
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
