import { useCallback, useMemo, useReducer, useRef } from "react";

import { useEventSource } from "@app/hooks/useEventSource";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
  ModelId,
} from "@app/types";
import { assertNever, isLightAgentMessageWithActionsType } from "@app/types";
import type {
  AgentMCPActionType,
  AgentMCPActionWithOutputType,
} from "@app/types/actions";

type AgentStateClassification =
  | "placeholder"
  | "thinking"
  | "acting"
  | "writing"
  | "done";

type ActionProgressState = Map<
  ModelId,
  {
    action: AgentMCPActionType;
    progress?: ProgressNotificationContentType;
  }
>;

interface MessageTemporaryState {
  message: LightAgentMessageWithActionsType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: ActionProgressState;
  useFullChainOfThought: boolean;
}

type AgentMessageStateEvent = (AgentMessageEvents | ToolNotificationEvent) & {
  step: number;
};

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

const CLEAR_CONTENT_EVENT = { type: "clear_content" as const };
const RETRY_BLOCKED_ACTIONS_STARTED_EVENT = {
  type: "retry_blocked_actions_started" as const,
};

type ClearContentEvent = typeof CLEAR_CONTENT_EVENT;
type RetryBlockedActionsStartedEvent =
  typeof RETRY_BLOCKED_ACTIONS_STARTED_EVENT;

function messageReducer(
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

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function makeInitialMessageStreamState({
  useFullChainOfThought,
}: {
  useFullChainOfThought: boolean;
}) {
  return (
    message: LightAgentMessageType | LightAgentMessageWithActionsType
  ): MessageTemporaryState => {
    return {
      actionProgress: new Map(),
      agentState: message.status === "created" ? "thinking" : "done",
      isRetrying: false,
      lastUpdated: new Date(),
      message: {
        ...message,
        actions: isLightAgentMessageWithActionsType(message)
          ? message.actions
          : [],
      },
      useFullChainOfThought,
    };
  };
}

interface UseAgentMessageStreamParams {
  message: LightAgentMessageType | LightAgentMessageWithActionsType;
  conversationId: string | null;
  owner: LightWorkspaceType;
  mutateMessage?: () => void;
  onEventCallback?: (eventStr: string) => void;
  streamId: string;
  useFullChainOfThought: boolean;
}

/**
 * @deprecated This hook is legacy and should not be used for streaming conversation messages.
 * Use the newer streaming implementation via useAgentMessageStream instead.
 */
export function useAgentMessageStreamLegacy({
  message,
  conversationId,
  owner,
  mutateMessage,
  onEventCallback: customOnEventCallback,
  streamId,
  useFullChainOfThought,
}: UseAgentMessageStreamParams) {
  const [messageStreamState, dispatch] = useReducer(
    messageReducer,
    message,
    makeInitialMessageStreamState({ useFullChainOfThought })
  );

  const isFreshMountWithContent = useRef(
    message.status === "created" &&
      (!!message.content || !!message.chainOfThought)
  );

  const shouldStream = useMemo(() => {
    if (message.status !== "created") {
      return false;
    }

    switch (messageStreamState.message.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return false;
      case "created":
        return true;
      default:
        assertNever(messageStreamState.message.status);
    }
  }, [message.status, messageStreamState.message.status]);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
        // We have a lastEventId, so this is not a fresh mount
        isFreshMountWithContent.current = false;
      }
      const url = esURL + "?lastEventId=" + lastEventId;

      return url;
    },
    [conversationId, message.sId, owner.sId]
  );

  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      } = JSON.parse(eventStr);
      const eventType = eventPayload.data.type;

      // This event is emitted in front/lib/api/assistant/pubsub.ts. Its purpose is to signal the
      // end of the stream to the client. The message reducer does not, and should not, handle this
      // event, so we just return.
      if (eventType === "end-of-stream") {
        return;
      }

      if (eventType === "tool_approve_execution") {
        if (customOnEventCallback) {
          customOnEventCallback(eventStr);
        }
        return;
      }

      // If this is a fresh mount with existing content and we're getting generation_tokens,
      // we need to clear the content first to avoid duplication
      if (
        isFreshMountWithContent.current &&
        eventType === "generation_tokens" &&
        (eventPayload.data.classification === "tokens" ||
          eventPayload.data.classification === "chain_of_thought")
      ) {
        dispatch(CLEAR_CONTENT_EVENT);
        isFreshMountWithContent.current = false;
      }

      const shouldRefresh = [
        "agent_action_success",
        "agent_error",
        "agent_message_success",
        "agent_generation_cancelled",
      ].includes(eventType);

      if (shouldRefresh && mutateMessage) {
        void mutateMessage();
      }

      dispatch(eventPayload.data);

      if (customOnEventCallback) {
        customOnEventCallback(eventStr);
      }
    },
    [mutateMessage, customOnEventCallback]
  );

  useEventSource(buildEventSourceURL, onEventCallback, streamId, {
    isReadyToConsumeStream: shouldStream,
  });

  return {
    messageStreamState,
    dispatch,
    shouldStream,
    isFreshMountWithContent,
  };
}
