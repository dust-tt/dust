import type {
  AgentMessageStateWithControlEvent,
  AgentMessageWithStreaming,
  PendingToolCall,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useEventSource } from "@app/hooks/useEventSource";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import {
  isRunAgentChainOfThoughtProgressOutput,
  isRunAgentGenerationTokensProgressOutput,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  InlineActivityStep,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
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
      if (isAgentMessageWithStreaming(m) && m.sId === sId) {
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

export function upsertPendingToolCall(
  pendingToolCalls: PendingToolCall[],
  pendingToolCall: PendingToolCall
): PendingToolCall[] {
  const matchIndex = pendingToolCalls.findIndex(
    (toolCall) =>
      (pendingToolCall.toolCallId &&
        toolCall.toolCallId === pendingToolCall.toolCallId) ||
      (pendingToolCall.toolCallIndex !== undefined &&
        toolCall.toolCallIndex === pendingToolCall.toolCallIndex)
  );

  if (matchIndex === -1) {
    return [...pendingToolCalls, pendingToolCall];
  }

  return pendingToolCalls.map((toolCall, index) =>
    index === matchIndex
      ? {
          ...toolCall,
          ...pendingToolCall,
        }
      : toolCall
  );
}

export function removePendingToolCallForAction(
  pendingToolCalls: PendingToolCall[],
  action: Pick<
    AgentMCPActionWithOutputType,
    "functionCallId" | "functionCallName"
  >
): PendingToolCall[] {
  const matchIndex = pendingToolCalls.findIndex(
    (toolCall) => toolCall.toolCallId === action.functionCallId
  );

  if (matchIndex !== -1) {
    return pendingToolCalls.filter((_, index) => index !== matchIndex);
  }

  const fallbackMatchIndex = pendingToolCalls.findIndex(
    (toolCall) => toolCall.toolName === action.functionCallName
  );

  if (fallbackMatchIndex === -1) {
    return pendingToolCalls;
  }

  return pendingToolCalls.filter((_, index) => index !== fallbackMatchIndex);
}

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
  agentMessage: AgentMessageWithStreaming,
  event: ToolNotificationEvent
): AgentMessageWithStreaming {
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

function appendContentStep(
  steps: InlineActivityStep[],
  textContent: string,
  id: string
): InlineActivityStep[] {
  return [...steps, { type: "content", content: textContent, id }];
}

/**
 * Flush the current pending segment (CoT or content) as an activity step.
 *
 * In inline activity mode, a pending "tokens" segment is flushed as a content
 * step and `content.current` is cleared so the next segment starts fresh.
 * In non-inline mode, content is left untouched (it accumulates as the body).
 *
 * Returns the updated steps and whether the body content was cleared.
 */
function flushPendingSegment({
  lastClassification,
  chainOfThought,
  content,
  isInlineActivityEnabled,
  steps,
  suffix,
}: {
  lastClassification: { current: "tokens" | "chain_of_thought" | null };
  chainOfThought: { current: string };
  content: { current: string };
  isInlineActivityEnabled: boolean;
  steps: InlineActivityStep[];
  suffix: string;
}): { steps: InlineActivityStep[]; contentCleared: boolean } {
  const cls = lastClassification.current;
  if (cls === "chain_of_thought" && chainOfThought.current) {
    const cotToFlush = chainOfThought.current;
    chainOfThought.current = "";
    return {
      steps: appendThinkingStep(steps, cotToFlush, `thinking-${suffix}`),
      contentCleared: false,
    };
  }
  if (cls === "tokens" && content.current && isInlineActivityEnabled) {
    const textToFlush = content.current;
    content.current = "";
    return {
      steps: appendContentStep(steps, textToFlush, `content-${suffix}`),
      contentCleared: true,
    };
  }
  return { steps, contentCleared: false };
}

interface UseAgentMessageStreamParams {
  agentMessage: AgentMessageWithStreaming;
  conversationId: string | null;
  isInlineActivityEnabled: boolean;
  owner: LightWorkspaceType;
  onEventCallback?: (event: {
    eventId: string;
    data: AgentMessageStateWithControlEvent;
  }) => void;
  streamId: string;
  useFullChainOfThought: boolean;
  virtuosoMethods: VirtuosoMessageListMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >;
}

export function useAgentMessageStream({
  agentMessage,
  conversationId,
  isInlineActivityEnabled,
  owner,
  onEventCallback: customOnEventCallback,
  streamId,
  virtuosoMethods,
}: UseAgentMessageStreamParams) {
  const sId = agentMessage.sId;
  const methods = virtuosoMethods;

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
  // In inline mode, content.current tracks the current text segment only
  // (cleared on each flush). In non-inline mode, it accumulates all text.
  const content = useRef(agentMessage.content ?? "");
  // Tracks the last token classification to detect transitions between
  // thinking (chain_of_thought) and writing (tokens), flushing completed
  // segments as activity steps on each switch.
  const lastClassification = useRef<"tokens" | "chain_of_thought" | null>(null);

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

        case "tool_ask_user_question":
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
            // Detect classification transitions and flush completed segments.
            if (
              lastClassification.current !== null &&
              classification !== lastClassification.current
            ) {
              const newAgentState =
                classification === "tokens" && isInlineActivityEnabled
                  ? "writing"
                  : "thinking";
              methods.data.map((m) => {
                if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
                  return m;
                }
                const { steps, contentCleared } = flushPendingSegment({
                  lastClassification,
                  chainOfThought,
                  content,
                  isInlineActivityEnabled,
                  steps: m.streaming.inlineActivitySteps,
                  suffix: `pre-${Date.now()}`,
                });
                return {
                  ...m,
                  ...(contentCleared ? { content: "" } : {}),
                  streaming: {
                    ...m.streaming,
                    agentState: newAgentState,
                    inlineActivitySteps: steps,
                  },
                };
              });
            } else if (
              isInlineActivityEnabled &&
              lastClassification.current === null &&
              classification === "tokens"
            ) {
              // First tokens event in inline mode — set agentState to writing.
              methods.data.map((m) => {
                if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
                  return m;
                }
                return {
                  ...m,
                  streaming: { ...m.streaming, agentState: "writing" },
                };
              });
            }

            lastClassification.current = classification;

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
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            // Add the completed action to inline activity steps.
            const alreadyCaptured = m.streaming.inlineActivitySteps.some(
              (s) => s.id === `action-${action.id}`
            );
            const steps = alreadyCaptured
              ? m.streaming.inlineActivitySteps
              : [
                  ...m.streaming.inlineActivitySteps,
                  {
                    type: "action" as const,
                    label: getActionOneLineLabel(action),
                    id: `action-${action.id}`,
                    actionId: action.sId,
                    internalMCPServerName: action.internalMCPServerName,
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
                pendingToolCalls: removePendingToolCallForAction(
                  m.streaming.pendingToolCalls,
                  action
                ),
              },
            };
          });

          break;

        case "tool_params":
          const toolParams = eventPayload.data;
          methods.data.map((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            const { steps, contentCleared } = flushPendingSegment({
              lastClassification,
              chainOfThought,
              content,
              isInlineActivityEnabled,
              steps: m.streaming.inlineActivitySteps,
              suffix: `toolparams-${Date.now()}`,
            });
            return {
              ...updateMessageWithAction(m, toolParams.action),
              ...(contentCleared ? { content: "" } : {}),
              streaming: {
                ...m.streaming,
                agentState: "acting",
                inlineActivitySteps: steps,
                pendingToolCalls: removePendingToolCallForAction(
                  m.streaming.pendingToolCalls,
                  toolParams.action
                ),
              },
            };
          });
          lastClassification.current = null;
          break;

        case "tool_notification":
          const toolNotification = eventPayload.data;
          methods.data.map((m) =>
            isAgentMessageWithStreaming(m) && m.sId === sId
              ? updateProgress(m, toolNotification)
              : m
          );
          break;

        case "tool_call_started":
          const toolCallStarted = eventPayload.data;
          if (toolCallStarted.type !== "tool_call_started") {
            break;
          }
          methods.data.map((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }

            return {
              ...m,
              streaming: {
                ...m.streaming,
                pendingToolCalls: upsertPendingToolCall(
                  m.streaming.pendingToolCalls,
                  {
                    toolName: toolCallStarted.toolName,
                    toolCallId: toolCallStarted.toolCallId,
                    toolCallIndex: toolCallStarted.toolCallIndex,
                  }
                ),
              },
            };
          });
          break;

        case "tool_error":
        case "agent_error":
          const error = eventPayload.data.error;
          methods.data.map((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            const { steps, contentCleared } = flushPendingSegment({
              lastClassification,
              chainOfThought,
              content,
              isInlineActivityEnabled,
              steps: m.streaming.inlineActivitySteps,
              suffix: `error-${Date.now()}`,
            });
            return {
              ...m,
              status: "failed",
              error: error,
              ...(contentCleared ? { content: null } : {}),
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
            isAgentMessageWithStreaming(m) && m.sId === sId
              ? {
                  ...m,
                  prunedContext: true,
                }
              : m
          );
          break;

        case "agent_generation_cancelled": {
          methods.data.map((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            const { steps, contentCleared } = flushPendingSegment({
              lastClassification,
              chainOfThought,
              content,
              isInlineActivityEnabled,
              steps: m.streaming.inlineActivitySteps,
              suffix: `cancel-${Date.now()}`,
            });
            return {
              ...m,
              status: "cancelled",
              ...(contentCleared ? { content: null } : {}),
              streaming: {
                ...m.streaming,
                agentState: "done",
                inlineActivitySteps: steps,
                pendingToolCalls: [],
              },
            };
          });
          break;
        }

        case "agent_message_gracefully_stopped":
        case "agent_message_success": {
          const messageSuccess = eventPayload.data;
          // Flush any remaining CoT (but not content — the final text segment
          // becomes the message body via the server's canonical message).
          const cotAtSuccess = chainOfThought.current;
          chainOfThought.current = "";
          // In inline activity mode, content.current tracks only the final
          // text segment (intermediate segments were flushed to content steps).
          // The server's full message includes ALL text, so we override with
          // the tracked final segment. In non-inline mode, we trust the server.
          const finalSegment = content.current;
          lastClassification.current = null;
          methods.data.map((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
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
              ...(isInlineActivityEnabled
                ? { content: finalSegment || null }
                : {}),
              streaming: {
                ...m.streaming,
                agentState: "done",
                inlineActivitySteps: steps,
                pendingToolCalls: [],
              },
            };
          });
          break;
        }

        default:
          assertNeverAndIgnore(eventType);
      }

      if (customOnEventCallback) {
        customOnEventCallback(eventPayload);
      }
    },
    [customOnEventCallback, isInlineActivityEnabled, methods, sId]
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
