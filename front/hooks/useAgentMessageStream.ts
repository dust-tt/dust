import type {
  AgentMessageStateWithControlEvent,
  InlineActivityStep,
  MessageTemporaryState,
  PendingToolCall,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import { isMessageTemporayState } from "@app/components/assistant/conversation/types";
import { useEventSource } from "@app/hooks/useEventSource";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import {
  isRunAgentChainOfThoughtProgressOutput,
  isRunAgentGenerationTokensProgressOutput,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { LightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import { useCallback, useMemo, useRef } from "react";

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
      if (isMessageTemporayState(m) && m.sId === sId) {
        return {
          ...m,
          content,
          chainOfThought,
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
  agentMessage: MessageTemporaryState,
  event: ToolNotificationEvent
): MessageTemporaryState {
  const actionId = event.action.id;
  const currentProgress = agentMessage.streaming.actionProgress.get(actionId);

  const output = event.notification._meta?.data?.output;
  const prevOutput = currentProgress?.progress?._meta?.data?.output;

  // The server sends deltas (not full state) for run_agent CoT/content tokens.
  // We accumulate by reading the previous value from the stored progress output.
  //
  // Note: progress only holds one output type at a time. When the output switches from CoT
  // to content, the accumulated CoT is lost here. The component's React state retains it,
  // which is good enough for live streaming. On replay (page reload), CoT may be lost if content
  // tokens have already started. This also means interleaved CoT/content/CoT is not supported.
  let notificationWithAccumulated = event.notification;

  if (output) {
    if (isRunAgentChainOfThoughtProgressOutput(output)) {
      const prevCoT =
        prevOutput && isRunAgentChainOfThoughtProgressOutput(prevOutput)
          ? prevOutput.chainOfThought
          : "";
      notificationWithAccumulated = {
        ...event.notification,
        _meta: {
          ...event.notification._meta,
          data: {
            ...event.notification._meta.data,
            output: {
              ...output,
              chainOfThought: prevCoT + output.chainOfThought,
            },
          },
        },
      };
    } else if (isRunAgentGenerationTokensProgressOutput(output)) {
      const prevText =
        prevOutput && isRunAgentGenerationTokensProgressOutput(prevOutput)
          ? prevOutput.text
          : "";
      notificationWithAccumulated = {
        ...event.notification,
        _meta: {
          ...event.notification._meta,
          data: {
            ...event.notification._meta.data,
            output: { ...output, text: prevText + output.text },
          },
        },
      };
    }
  }

  return {
    ...agentMessage,
    streaming: {
      ...agentMessage.streaming,
      actionProgress: new Map(agentMessage.streaming.actionProgress).set(
        actionId,
        {
          action: event.action,
          progress: {
            ...currentProgress?.progress,
            ...notificationWithAccumulated,
            _meta: {
              ...currentProgress?.progress?._meta,
              ...notificationWithAccumulated._meta,
            },
          },
        }
      ),
    },
  };
}

/**
 * Append a thinking step to the inline activity steps if the content
 * is new (not a duplicate of the last thinking step).
 */
function appendThinkingStep(
  steps: InlineActivityStep[],
  cotContent: string,
  id: string
): InlineActivityStep[] {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type === "thinking") {
      if (step.content === cotContent) {
        return steps;
      }
      break;
    }
  }
  return [...steps, { type: "thinking", content: cotContent, id }];
}

function getPendingToolCallKey({
  toolCallId,
  toolCallIndex,
  toolName,
}: {
  toolCallId?: string;
  toolCallIndex?: number;
  toolName: string;
}): string {
  if (toolCallId) {
    return toolCallId;
  }
  if (toolCallIndex !== undefined) {
    return `tool-call-${toolCallIndex}`;
  }
  return `tool-call-${toolName}`;
}

function getPendingToolCallMatchIndex(
  pendingToolCalls: PendingToolCall[],
  {
    toolCallId,
    toolCallIndex,
    toolName,
  }: {
    toolCallId?: string;
    toolCallIndex?: number;
    toolName: string;
  }
): number {
  return pendingToolCalls.findIndex((pendingToolCall) => {
    if (toolCallId && pendingToolCall.toolCallId === toolCallId) {
      return true;
    }

    if (
      toolCallIndex !== undefined &&
      pendingToolCall.toolCallIndex === toolCallIndex
    ) {
      return true;
    }

    return (
      !toolCallId &&
      toolCallIndex === undefined &&
      !pendingToolCall.toolCallId &&
      pendingToolCall.toolCallIndex === undefined &&
      pendingToolCall.name === toolName
    );
  });
}

export function upsertPendingToolCall(
  pendingToolCalls: PendingToolCall[],
  {
    toolCallId,
    toolCallIndex,
    toolName,
  }: {
    toolCallId?: string;
    toolCallIndex?: number;
    toolName: string;
  }
): PendingToolCall[] {
  const matchIndex = getPendingToolCallMatchIndex(pendingToolCalls, {
    toolCallId,
    toolCallIndex,
    toolName,
  });

  const nextPendingToolCall: PendingToolCall = {
    key:
      matchIndex !== -1
        ? pendingToolCalls[matchIndex].key
        : getPendingToolCallKey({ toolCallId, toolCallIndex, toolName }),
    name: toolName,
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolCallIndex !== undefined ? { toolCallIndex } : {}),
  };

  if (matchIndex === -1) {
    return [...pendingToolCalls, nextPendingToolCall];
  }

  return pendingToolCalls.map((pendingToolCall, index) =>
    index === matchIndex
      ? {
          ...pendingToolCall,
          ...nextPendingToolCall,
        }
      : pendingToolCall
  );
}

export function removePendingToolCall(
  pendingToolCalls: PendingToolCall[],
  action: Pick<
    AgentMCPActionWithOutputType,
    "functionCallId" | "functionCallName"
  >
): PendingToolCall[] {
  const pendingToolCallWithIdIndex = pendingToolCalls.findIndex(
    (pendingToolCall) => pendingToolCall.toolCallId === action.functionCallId
  );
  if (pendingToolCallWithIdIndex !== -1) {
    return pendingToolCalls.filter(
      (_, index) => index !== pendingToolCallWithIdIndex
    );
  }

  const pendingToolCallsWithSameName = pendingToolCalls.filter(
    (pendingToolCall) => pendingToolCall.name === action.functionCallName
  );

  if (pendingToolCallsWithSameName.length !== 1) {
    return pendingToolCalls;
  }

  return pendingToolCalls.filter(
    (pendingToolCall) => pendingToolCall !== pendingToolCallsWithSameName[0]
  );
}

interface UseAgentMessageStreamParams {
  agentMessage: MessageTemporaryState;
  conversationId: string | null;
  owner: LightWorkspaceType;
  onEventCallback?: (event: {
    eventId: string;
    data: AgentMessageStateWithControlEvent;
  }) => void;
  streamId: string;
  useFullChainOfThought: boolean;
}

export function useAgentMessageStream({
  agentMessage,
  conversationId,
  owner,
  onEventCallback: customOnEventCallback,
  streamId,
}: UseAgentMessageStreamParams) {
  const sId = agentMessage.sId;
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const shouldStream = useMemo(
    () =>
      agentMessage.status === "created" &&
      agentMessage.streaming.agentState !== "placeholder",
    [agentMessage.status, agentMessage.streaming.agentState]
  );

  const isFreshMountWithContent = useRef(
    shouldStream && (!!agentMessage.content || !!agentMessage.chainOfThought)
  );

  const chainOfThought = useRef(agentMessage.chainOfThought ?? "");
  const content = useRef(agentMessage.content ?? "");
  // Tracks whether response token generation has started, to flush CoT once.
  const writingStarted = useRef(false);

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

      return esURL + "?lastEventId=" + lastEventId;
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

        case "tool_personal_auth_required":
        case "tool_file_auth_required":
        case "tool_approve_execution":
          break;

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
            // First "tokens" event means thinking → writing: flush pending CoT once.
            if (
              classification === "tokens" &&
              !writingStarted.current &&
              chainOfThought.current
            ) {
              writingStarted.current = true;
              const cotToFlush = chainOfThought.current;
              chainOfThought.current = "";
              methods.data.map((m) => {
                if (!isMessageTemporayState(m) || m.sId !== sId) {
                  return m;
                }
                return {
                  ...m,
                  streaming: {
                    ...m.streaming,
                    inlineActivitySteps: appendThinkingStep(
                      m.streaming.inlineActivitySteps,
                      cotToFlush,
                      `thinking-pretokens-${Date.now()}`
                    ),
                  },
                };
              });
            }

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
          methods.data.map((m) => {
            if (!isMessageTemporayState(m) || m.sId !== sId) {
              return m;
            }
            // Add the completed action to inline activity steps.
            const alreadyCaptured = m.streaming.inlineActivitySteps.some(
              (s) => s.type === "action" && s.action.id === action.id
            );
            const steps = alreadyCaptured
              ? m.streaming.inlineActivitySteps
              : [
                  ...m.streaming.inlineActivitySteps,
                  {
                    type: "action" as const,
                    action,
                    id: `action-${action.id}`,
                  },
                ];
            return {
              ...updateMessageWithAction(m, action),
              streaming: {
                ...m.streaming,
                agentState: "thinking",
                inlineActivitySteps: steps,
                // Clean up progress for this specific action.
                actionProgress: new Map(
                  Array.from(m.streaming.actionProgress.entries()).filter(
                    ([id]) => id !== action.id
                  )
                ),
                pendingToolCalls: removePendingToolCall(
                  m.streaming.pendingToolCalls,
                  action
                ),
              },
            };
          });

          break;

        case "tool_params":
          const toolParams = eventPayload.data;
          writingStarted.current = false;
          // Snapshot CoT before it gets cleared by updateMessageWithAction.
          const cotAtToolParams = chainOfThought.current;
          chainOfThought.current = "";
          methods.data.map((m) => {
            if (!isMessageTemporayState(m) || m.sId !== sId) {
              return m;
            }
            const steps = cotAtToolParams
              ? appendThinkingStep(
                  m.streaming.inlineActivitySteps,
                  cotAtToolParams,
                  `thinking-${Date.now()}`
                )
              : m.streaming.inlineActivitySteps;
            return {
              ...updateMessageWithAction(m, toolParams.action),
              streaming: {
                ...m.streaming,
                agentState: "acting",
                inlineActivitySteps: steps,
                pendingToolCalls: removePendingToolCall(
                  m.streaming.pendingToolCalls,
                  toolParams.action
                ),
              },
            };
          });
          break;

        case "tool_call_started":
          const startedToolCall = eventPayload.data;
          const cotAtToolCallStart = chainOfThought.current;
          chainOfThought.current = "";
          methods.data.map((m) => {
            if (!isMessageTemporayState(m) || m.sId !== sId) {
              return m;
            }

            const pendingToolCalls = upsertPendingToolCall(
              m.streaming.pendingToolCalls,
              startedToolCall
            );

            const steps = cotAtToolCallStart
              ? appendThinkingStep(
                  m.streaming.inlineActivitySteps,
                  cotAtToolCallStart,
                  `thinking-tool-call-${Date.now()}`
                )
              : m.streaming.inlineActivitySteps;

            return {
              ...m,
              chainOfThought: "",
              streaming: {
                ...m.streaming,
                inlineActivitySteps: steps,
                pendingToolCalls,
              },
            };
          });
          break;

        case "tool_notification":
          const toolNotification = eventPayload.data;
          methods.data.map((m) =>
            isMessageTemporayState(m) && m.sId === sId
              ? updateProgress(m, toolNotification)
              : m
          );
          break;

        case "tool_error":
        case "agent_error":
          const error = eventPayload.data.error;
          const cotAtError = chainOfThought.current;
          chainOfThought.current = "";
          methods.data.map((m) => {
            if (!isMessageTemporayState(m) || m.sId !== sId) {
              return m;
            }
            const steps = cotAtError
              ? appendThinkingStep(
                  m.streaming.inlineActivitySteps,
                  cotAtError,
                  `thinking-error-${Date.now()}`
                )
              : m.streaming.inlineActivitySteps;
            return {
              ...m,
              status: "failed",
              error: error,
              streaming: {
                ...m.streaming,
                agentState: "done",
                inlineActivitySteps: steps,
                pendingToolCalls: [],
              },
            };
          });
          break;

        case "agent_context_pruned":
          methods.data.map((m) =>
            isMessageTemporayState(m) && m.sId === sId
              ? {
                  ...m,
                  prunedContext: true,
                }
              : m
          );
          break;

        case "agent_generation_cancelled":
          methods.data.map((m) =>
            isMessageTemporayState(m) && m.sId === sId
              ? {
                  ...m,
                  status: "cancelled",
                  streaming: {
                    ...m.streaming,
                    agentState: "done",
                    pendingToolCalls: [],
                  },
                }
              : m
          );
          break;

        case "agent_message_success":
          const messageSuccess = eventPayload.data;
          // Safety net: flush any remaining CoT not yet captured.
          const cotAtSuccess = chainOfThought.current;
          chainOfThought.current = "";
          methods.data.map((m) => {
            if (!isMessageTemporayState(m) || m.sId !== sId) {
              return m;
            }
            const steps = cotAtSuccess
              ? appendThinkingStep(
                  m.streaming.inlineActivitySteps,
                  cotAtSuccess,
                  `thinking-final-${Date.now()}`
                )
              : m.streaming.inlineActivitySteps;
            return {
              ...m,
              ...getLightAgentMessageFromAgentMessage(messageSuccess.message),
              status: "succeeded",
              streaming: {
                ...m.streaming,
                agentState: "done",
                inlineActivitySteps: steps,
                pendingToolCalls: [],
              },
            };
          });
          break;

        default:
          assertNeverAndIgnore(eventType);
      }

      if (customOnEventCallback) {
        customOnEventCallback(eventPayload);
      }
    },
    [customOnEventCallback, methods, sId]
  );

  const { isError } = useEventSource(
    buildEventSourceURL,
    onEventCallback,
    streamId,
    {
      isReadyToConsumeStream: shouldStream,
    }
  );

  return {
    streamError: isError,
    shouldStream,
    isFreshMountWithContent,
  };
}
