import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
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

  const isFreshMountWithContent = useRef(
    messageStreamState.message.status === "created" &&
      (!!messageStreamState.message.content ||
        !!messageStreamState.message.chainOfThought)
  );

  const shouldStream = useMemo(
    () => messageStreamState.message.status === "created",
    [messageStreamState.message.status]
  );

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
            methods.data.map((m) =>
              isMessageTemporayState(m) && getMessageSId(m) === sId
                ? {
                    ...m,
                    message: {
                      ...m.message,
                      content: null,
                      chainOfThought: null,
                    },
                  }
                : m
            );
            isFreshMountWithContent.current = false;
          }

          const generationTokens = eventPayload.data;
          const classification = generationTokens.classification;
          methods.data.map((m) => {
            if (isMessageTemporayState(m) && getMessageSId(m) === sId) {
              switch (classification) {
                case "opening_delimiter":
                case "closing_delimiter":
                  return m;

                case "tokens": {
                  return {
                    ...m,
                    message: {
                      ...m.message,
                      content:
                        (m.message.content ?? "") + generationTokens.text,
                    },
                    agentState: "writing",
                  };
                }
                case "chain_of_thought": {
                  // If we're not using the full chain of thought, reset at paragraph boundaries.
                  const chainOfThought =
                    !m.useFullChainOfThought && generationTokens.text === "\n\n"
                      ? ""
                      : (m.message.chainOfThought ?? "") +
                        generationTokens.text;
                  return {
                    ...m,
                    message: {
                      ...m.message,
                      chainOfThought,
                    },
                    agentState: "thinking",
                  };
                }
                default:
                  assertNever(classification);
              }
            } else {
              return m;
            }
          });
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
    [customOnEventCallback, methods.data, mutateMessage, sId]
  );

  useEventSource(buildEventSourceURL, onEventCallback, streamId, {
    isReadyToConsumeStream: shouldStream,
  });

  return {
    shouldStream,
    isFreshMountWithContent,
  };
}
