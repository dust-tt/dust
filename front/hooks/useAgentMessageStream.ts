import { useCallback, useMemo, useReducer, useRef } from "react";

import { useEventSource } from "@app/hooks/useEventSource";
import type {
  AgentMessageStateEvent,
  MessageTemporaryState,
} from "@app/lib/assistant/state/messageReducer";
import {
  CLEAR_CONTENT_EVENT,
  messageReducer,
} from "@app/lib/assistant/state/messageReducer";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
} from "@app/types";
import { isLightAgentMessageWithActionsType } from "@app/types";
import { assertNever } from "@app/types";

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function makeInitialMessageStreamState(
  message: LightAgentMessageType | LightAgentMessageWithActionsType
): MessageTemporaryState {
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
  };
}

interface UseAgentMessageStreamParams {
  message: LightAgentMessageType | LightAgentMessageWithActionsType;
  conversationId: string | null;
  owner: LightWorkspaceType;
  mutateMessage?: () => void;
  onEventCallback?: (eventStr: string) => void;
  streamId: string;
}

export function useAgentMessageStream({
  message,
  conversationId,
  owner,
  mutateMessage,
  onEventCallback: customOnEventCallback,
  streamId,
}: UseAgentMessageStreamParams) {
  const [messageStreamState, dispatch] = useReducer(
    messageReducer,
    message,
    makeInitialMessageStreamState
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
