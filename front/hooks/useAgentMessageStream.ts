import { useCallback, useMemo, useReducer, useRef } from "react";

import { useEventSource } from "@app/hooks/useEventSource";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type {
  AgentMessageStateEvent,
  MessageTemporaryState,
} from "@app/lib/assistant/state/messageReducer";
import {
  CLEAR_CONTENT_EVENT,
  messageReducer,
} from "@app/lib/assistant/state/messageReducer";
import type {
  AgentMessageType,
  LightAgentMessageType,
  LightWorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

type AgentMessageStateWithControlEvent =
  | AgentMessageStateEvent
  | { type: "end-of-stream" };

function makeInitialMessageStreamState(
  message: LightAgentMessageType
): MessageTemporaryState {
  return {
    actionProgress: new Map(),
    agentState: message.status === "created" ? "thinking" : "done",
    isRetrying: false,
    lastUpdated: new Date(),
    message,
  };
}

interface UseAgentMessageStreamParams {
  message: LightAgentMessageType | AgentMessageType;
  conversationId: string | null;
  owner: LightWorkspaceType;
  mutateMessage?: () => void;
  onEventCallback?: (eventStr: string) => void;
  streamId?: string;
}

export function useAgentMessageStream({
  message,
  conversationId,
  owner,
  mutateMessage,
  onEventCallback: customOnEventCallback,
  streamId,
}: UseAgentMessageStreamParams) {
  const lightMessage =
    "parsedContents" in message
      ? getLightAgentMessageFromAgentMessage(message)
      : message;

  const [messageStreamState, dispatch] = useReducer(
    messageReducer,
    lightMessage,
    makeInitialMessageStreamState
  );

  const isFreshMountWithContent = useRef(
    lightMessage.status === "created" &&
      (!!lightMessage.content || !!lightMessage.chainOfThought)
  );

  const shouldStream = useMemo(() => {
    if (lightMessage.status !== "created") {
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
  }, [lightMessage.status, messageStreamState.message.status]);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!shouldStream || !conversationId || !lightMessage.sId) {
        return null;
      }
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${lightMessage.sId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
        isFreshMountWithContent.current = false;
      }
      const url = esURL + "?lastEventId=" + lastEventId;
      return url;
    },
    [shouldStream, owner.sId, conversationId, lightMessage.sId]
  );

  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      } = JSON.parse(eventStr);
      const eventType = eventPayload.data.type;

      if (eventType === "end-of-stream") {
        return;
      }

      if (eventType === "tool_approve_execution") {
        if (customOnEventCallback) {
          customOnEventCallback(eventStr);
        }
        return;
      }

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

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    streamId || `message-${lightMessage.sId}`,
    { isReadyToConsumeStream: shouldStream }
  );

  return {
    messageStreamState,
    dispatch,
    shouldStream,
    isFreshMountWithContent,
  };
}
