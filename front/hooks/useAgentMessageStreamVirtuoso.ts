import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import _ from "lodash";
import { useCallback, useMemo, useRef } from "react";

import type {
  AgentMessageStateWithControlEvent,
  MessageTemporaryState,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageSId,
  isMessageTemporayState,
} from "@app/components/assistant/conversation/types";
import { useEventSource } from "@app/hooks/useEventSource";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type {
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";

// Throttle the update of the message to avoid excessive re-renders.
const updateMessageThrottled = _.throttle(
  ({
    chainOfThought,
    content,
    methods,
    sId,
  }: {
    chainOfThought: string;
    content: string;
    methods: VirtuosoMessageListMethods<
      VirtuosoMessage,
      VirtuosoMessageListContext
    >;
    sId: string;
  }) => {
    methods.data.map((m) => {
      if (isMessageTemporayState(m) && getMessageSId(m) === sId) {
        return {
          ...m,
          message: { ...m.message, chainOfThought, content },
        };
      }
      return m;
    });
  },
  100
);

export function updateMessageWithAction(
  m: LightAgentMessageWithActionsType,
  action: AgentMCPActionWithOutputType
): LightAgentMessageWithActionsType {
  return {
    ...m,
    chainOfThought: "",
    actions: [...m.actions.filter((a) => a.id !== action.id), action],
  };
}

export function updateProgress(
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
interface UseAgentMessageStreamParams {
  messageStreamState: MessageTemporaryState;
  conversationId: string | null;
  owner: LightWorkspaceType;
  mutateMessage?: () => void;
  onEventCallback?: (event: {
    eventId: string;
    data: AgentMessageStateWithControlEvent;
  }) => void;
  streamId: string;
  useFullChainOfThought: boolean;
}

export function useAgentMessageStreamVirtuoso({
  messageStreamState,
  conversationId,
  owner,
  mutateMessage,
  onEventCallback: customOnEventCallback,
  streamId,
}: UseAgentMessageStreamParams) {
  const sId = getMessageSId(messageStreamState);
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const shouldStream = useMemo(
    () =>
      messageStreamState.message.status === "created" &&
      messageStreamState.agentState !== "placeholder",
    [messageStreamState.message.status, messageStreamState.agentState]
  );

  const isFreshMountWithContent = useRef(
    shouldStream &&
      (!!messageStreamState.message.content ||
        !!messageStreamState.message.chainOfThought)
  );

  const chainOfThought = useRef(
    messageStreamState.message.chainOfThought ?? ""
  );
  const content = useRef(messageStreamState.message.content ?? "");

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${sId}/events`;
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
    [conversationId, sId, owner.sId]
  );

  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data: AgentMessageStateWithControlEvent;
      } = JSON.parse(eventStr);
      const eventType = eventPayload.data.type;
      switch (eventType) {
        case "end-of-stream":
          // This event is emitted in front/lib/api/assistant/pubsub.ts. Its purpose is to signal the
          // end of the stream to the client. So we just return.
          return;
        case "tool_approve_execution":
          return;

        case "generation_tokens":
          if (
            isFreshMountWithContent.current &&
            (eventPayload.data.classification === "tokens" ||
              eventPayload.data.classification === "chain_of_thought")
          ) {
            // If this is a fresh mount with existing content and we're getting generation_tokens,
            // we need to clear the content first to avoid duplication
            content.current = "";
            chainOfThought.current = "";
            isFreshMountWithContent.current = false;
          }

          const generationTokens = eventPayload.data;
          const classification = generationTokens.classification;

          if (
            classification === "tokens" ||
            classification === "chain_of_thought"
          ) {
            if (classification === "tokens") {
              content.current += generationTokens.text;
            } else if (classification === "chain_of_thought") {
              chainOfThought.current += generationTokens.text;
            }
            updateMessageThrottled({
              chainOfThought: chainOfThought.current,
              content: content.current,
              methods,
              sId,
            });
          }
          break;

        case "agent_action_success":
          const action = eventPayload.data.action;
          methods.data.map((m) =>
            isMessageTemporayState(m) && getMessageSId(m) === sId
              ? {
                  ...m,
                  message: updateMessageWithAction(m.message, action),
                  // Clean up progress for this specific action.
                  actionProgress: new Map(
                    Array.from(m.actionProgress.entries()).filter(
                      ([id]) => id !== action.id
                    )
                  ),
                }
              : m
          );

          break;

        case "tool_params":
          const toolParams = eventPayload.data;
          methods.data.map((m) =>
            isMessageTemporayState(m) && getMessageSId(m) === sId
              ? {
                  ...m,
                  message: updateMessageWithAction(
                    m.message,
                    toolParams.action
                  ),
                  agentState: "acting",
                }
              : m
          );
          break;

        case "tool_notification":
          const toolNotification = eventPayload.data;
          methods.data.map((m) =>
            isMessageTemporayState(m) && getMessageSId(m) === sId
              ? updateProgress(m, toolNotification)
              : m
          );
          break;

        case "tool_error":
        case "agent_error":
          const error = eventPayload.data.error;
          methods.data.map((m) =>
            isMessageTemporayState(m) && getMessageSId(m) === sId
              ? {
                  ...m,
                  message: {
                    ...m.message,
                    status: "failed",
                    error: error,
                  },
                  agentState: "done",
                }
              : m
          );
          break;

        case "agent_generation_cancelled":
          methods.data.map((m) =>
            isMessageTemporayState(m) && getMessageSId(m) === sId
              ? {
                  ...m,
                  message: { ...m.message, status: "cancelled" },
                  agentState: "done",
                }
              : m
          );
          break;

        case "agent_message_success":
          const messageSuccess = eventPayload.data;
          methods.data.map((m) =>
            isMessageTemporayState(m) && getMessageSId(m) === sId
              ? {
                  ...m,
                  message: {
                    ...getLightAgentMessageFromAgentMessage(
                      messageSuccess.message
                    ),
                    status: "succeeded",
                    actions: m.message.actions,
                    rank: m.message.rank,
                    version: m.message.version,
                  },
                  agentState: "done",
                }
              : m
          );
          break;

        default:
          assertNever(eventType);
      }

      if (customOnEventCallback) {
        customOnEventCallback(eventPayload);
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
    },
    [customOnEventCallback, methods, mutateMessage, sId]
  );

  useEventSource(buildEventSourceURL, onEventCallback, streamId, {
    isReadyToConsumeStream: shouldStream,
  });

  return {
    shouldStream,
    isFreshMountWithContent,
  };
}
