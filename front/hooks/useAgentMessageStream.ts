import type {
  AgentMessageStateWithControlEvent,
  AgentMessageWithStreaming,
  PendingToolCall,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useConversationContextUsage } from "@app/hooks/conversations";
import { useEventSource } from "@app/hooks/useEventSource";
import type { AgentLoopToolNotificationEvent } from "@app/lib/actions/mcp";
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
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import throttle from "lodash/throttle";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

const TOKEN_BUFFER_THRESHOLD_MS = 500;

type VirtuosoMethods = VirtuosoMessageListMethods<
  VirtuosoMessage,
  VirtuosoMessageListContext
>;

function createAutoScrollToBottomBehavior(
  isAutoScrollEnabledRef: MutableRefObject<boolean>
) {
  return ({
    scrollLocation,
    scrollInProgress,
  }: {
    scrollLocation: { bottomOffset: number };
    scrollInProgress: boolean;
  }) => {
    if (!isAutoScrollEnabledRef.current || scrollInProgress) {
      return false;
    }

    if (scrollLocation.bottomOffset < 0) {
      return false;
    }

    return {
      index: "LAST" as const,
      align: "end" as const,
      behavior: "smooth" as const,
    };
  };
}

function batchMapMessagesWithAutoScroll(
  methods: VirtuosoMethods,
  isAutoScrollEnabledRef: MutableRefObject<boolean>,
  mapFn: (message: VirtuosoMessage, index: number) => VirtuosoMessage
) {
  methods.data.batch(
    () => methods.data.map(mapFn),
    createAutoScrollToBottomBehavior(isAutoScrollEnabledRef)
  );
}

function createUpdateMessageThrottled(
  isAutoScrollEnabledRef: MutableRefObject<boolean>,
  methods: VirtuosoMethods
) {
  return throttle(
    ({
      chainOfThought,
      content,
      sId,
    }: {
      chainOfThought: string;
      content: string;
      sId: string;
    }) => {
      batchMapMessagesWithAutoScroll(methods, isAutoScrollEnabledRef, (m) => {
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
    TOKEN_BUFFER_THRESHOLD_MS
  );
}

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
  agentMessage: AgentMessageWithStreaming,
  event: AgentLoopToolNotificationEvent
): AgentMessageWithStreaming {
  const actionId = event.action.id;
  const currentProgress = agentMessage.streaming.actionProgress.get(actionId);

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
            ...event.notification,
            _meta: {
              ...currentProgress?.progress?._meta,
              ...event.notification._meta,
            },
          },
        }
      ),
    },
  };
}

/**
 * Append a thinking step to the inline activity steps, unless it is a duplicate.
 *
 * Two dedup guards: (1) the id is derived from the triggering event so a replay
 * after a remount regenerates the same id — we skip it if already present; and
 * (2) within a mount we skip content identical to the most recent thinking step.
 */
export function appendThinkingStep(
  steps: InlineActivityStep[],
  cotContent: string,
  id: string,
  stepIndex: number
): InlineActivityStep[] {
  if (steps.some((step) => step.id === id)) {
    return steps;
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type === "thinking") {
      if (step.content === cotContent) {
        return steps;
      }
      break;
    }
  }
  return [
    ...steps,
    { type: "thinking", content: cotContent, id, step: stepIndex },
  ];
}

function appendContentStep(
  steps: InlineActivityStep[],
  textContent: string,
  id: string,
  stepIndex: number
): InlineActivityStep[] {
  // Skip if already present — the id is event-derived, so a replay after a
  // remount regenerates the same id instead of appending a duplicate.
  if (steps.some((step) => step.id === id)) {
    return steps;
  }
  return [
    ...steps,
    { type: "content", content: textContent, id, step: stepIndex },
  ];
}

/**
 * Flush the current pending segment (CoT or content) as an activity step.
 *
 * A pending "tokens" segment is flushed as a content step and
 * `content.current` is cleared so the next segment starts fresh.
 *
 * Returns the updated steps and whether the body content was cleared.
 */
function flushPendingSegment({
  lastClassification,
  chainOfThought,
  content,
  steps,
  suffix,
  stepIndex,
  retryCoTBuffer,
}: {
  lastClassification: { current: "tokens" | "chain_of_thought" | null };
  chainOfThought: { current: string };
  content: { current: string };
  steps: InlineActivityStep[];
  suffix: string;
  stepIndex: number;
  retryCoTBuffer?: { current: string | null };
}): { steps: InlineActivityStep[]; contentCleared: boolean } {
  const cls = lastClassification.current;
  if (cls === "chain_of_thought" && chainOfThought.current) {
    const cotToFlush = chainOfThought.current;
    chainOfThought.current = "";
    if (retryCoTBuffer) {
      retryCoTBuffer.current = null;
    }
    return {
      steps: appendThinkingStep(
        steps,
        cotToFlush,
        `thinking-${suffix}`,
        stepIndex
      ),
      contentCleared: false,
    };
  }
  if (cls === "tokens" && content.current) {
    const textToFlush = content.current;
    content.current = "";
    return {
      steps: appendContentStep(
        steps,
        textToFlush,
        `content-${suffix}`,
        stepIndex
      ),
      contentCleared: true,
    };
  }
  return { steps, contentCleared: false };
}

interface UseAgentMessageStreamParams {
  agentMessage: AgentMessageWithStreaming;
  conversationId: string | null;
  isAutoScrollEnabledRef: MutableRefObject<boolean>;
  owner: LightWorkspaceType;
  onEventCallback?: (event: {
    eventId: string;
    data: AgentMessageStateWithControlEvent;
  }) => void;
  streamId: string;
}

export function useAgentMessageStream({
  agentMessage,
  conversationId,
  isAutoScrollEnabledRef,
  owner,
  onEventCallback: customOnEventCallback,
  streamId,
}: UseAgentMessageStreamParams) {
  const sId = agentMessage.sId;
  const { mutateContextUsage } = useConversationContextUsage({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const updateMessageThrottled = useMemo(
    () => createUpdateMessageThrottled(isAutoScrollEnabledRef, methods),
    [isAutoScrollEnabledRef, methods]
  );

  const mapMessagesWithAutoScroll = useCallback(
    (mapFn: (message: VirtuosoMessage, index: number) => VirtuosoMessage) => {
      batchMapMessagesWithAutoScroll(methods, isAutoScrollEnabledRef, mapFn);
    },
    [methods, isAutoScrollEnabledRef]
  );

  // Short-circuit reconnect replays within this mount (useEventSource reconnects
  // on every server "done" frame / network error and the server re-sends
  // history). This ref resets on remount, which is fine: a remount re-runs the
  // whole replay to rebuild the parser state, and steps are de-duplicated on
  // insert by their stable, event-derived ids so nothing is appended twice.
  const seenEventIds = useRef<Set<string>>(new Set());
  const isStreamTerminated = useRef(false);

  useEffect(() => {
    return () => {
      updateMessageThrottled.cancel();
    };
  }, [updateMessageThrottled]);

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
  // content.current tracks the current text segment only
  // (cleared on each flush to inline activity steps).
  const content = useRef(agentMessage.content ?? "");
  // Tracks the last token classification to detect transitions between
  // thinking (chain_of_thought) and writing (tokens), flushing completed
  // segments as activity steps on each switch.
  const lastClassification = useRef<"tokens" | "chain_of_thought" | null>(null);
  // Tracks the traceId of the last CoT event to detect Temporal retry boundaries.
  const lastCoTTraceId = useRef<string | null>(null);
  // Tracks the agent-loop step of the last generation event. Combined with a
  // traceId change, an unchanged step number means the SAME step was re-run
  // (Temporal activity retry) rather than the loop advancing to a new step. It is
  // the signal we use to drop and rebuild that step's committed inline steps.
  const currentStep = useRef<number | null>(null);
  // Shadow buffer for retry CoT suppression. When a new traceId arrives, CoT
  // tokens are accumulated here instead of directly into chainOfThought.current.
  // As long as the buffer is a prefix of the existing CoT, display is unchanged
  // (no blank/refill). Once it diverges, chainOfThought.current is replaced with
  // the new content. Null means normal (non-retry) accumulation mode.
  const retryCoTBuffer = useRef<string | null>(null);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (isStreamTerminated.current) {
        return null;
      }
      const esURL = `/api/sse/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${sId}/events`;
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
      if (eventPayload.eventId) {
        if (seenEventIds.current.has(eventPayload.eventId)) {
          return;
        }
        seenEventIds.current.add(eventPayload.eventId);
      }
      const eventType = eventPayload.data.type;
      switch (eventType) {
        case "end-of-stream":
          // This event is emitted in front/lib/api/assistant/pubsub.ts. Its purpose is to signal the
          // end of the stream to the client. So we just return.
          isStreamTerminated.current = true;
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
            lastCoTTraceId.current = null;
            retryCoTBuffer.current = null;
            currentStep.current = null;
            mapMessagesWithAutoScroll((m) => {
              if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
                return m;
              }

              return {
                ...m,
                content: "",
                chainOfThought: "",
              };
            });
            isFreshMountWithContent.current = false;
          }

          const generationTokens = eventPayload.data;
          const classification = generationTokens.classification;
          const eventStep = generationTokens.step;

          if (
            classification === "tokens" ||
            classification === "chain_of_thought"
          ) {
            // When a CoT event arrives with a new traceId, the Temporal activity
            // was retried. Reset content.current (prevents stale tokens from
            // being flushed at the transition boundary) and enter shadow-buffer
            // mode: new CoT tokens are compared against what's already shown
            // rather than appended, so an identical retry is invisible to the
            // user.
            if (classification === "chain_of_thought") {
              const newTraceId = generationTokens.traceId;
              if (
                newTraceId &&
                lastCoTTraceId.current !== null &&
                newTraceId !== lastCoTTraceId.current
              ) {
                content.current = "";
                retryCoTBuffer.current = "";
                if (
                  currentStep.current !== null &&
                  eventStep === currentStep.current
                ) {
                  mapMessagesWithAutoScroll((m) => {
                    if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
                      return m;
                    }
                    return {
                      ...m,
                      streaming: {
                        ...m.streaming,
                        inlineActivitySteps:
                          m.streaming.inlineActivitySteps.filter(
                            (s) => s.step !== eventStep
                          ),
                      },
                    };
                  });
                }
              }
              if (newTraceId) {
                lastCoTTraceId.current = newTraceId;
              }
            }

            currentStep.current = eventStep;

            // Detect classification transitions and flush completed segments.
            if (
              lastClassification.current !== null &&
              classification !== lastClassification.current
            ) {
              updateMessageThrottled.cancel();
              const newAgentState =
                classification === "tokens" ? "writing" : "thinking";
              mapMessagesWithAutoScroll((m) => {
                if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
                  return m;
                }
                const { steps, contentCleared } = flushPendingSegment({
                  lastClassification,
                  chainOfThought,
                  content,
                  steps: m.streaming.inlineActivitySteps,
                  suffix: `pre-${eventPayload.eventId || Date.now()}`,
                  stepIndex: eventStep,
                  retryCoTBuffer,
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
              lastClassification.current === null &&
              classification === "tokens"
            ) {
              // First tokens event in inline mode — set agentState to writing.
              mapMessagesWithAutoScroll((m) => {
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

            let suppressUpdate = false;
            if (classification === "tokens") {
              content.current += generationTokens.text;
            } else if (classification === "chain_of_thought") {
              if (retryCoTBuffer.current !== null) {
                retryCoTBuffer.current += generationTokens.text;
                if (
                  !chainOfThought.current.startsWith(retryCoTBuffer.current)
                ) {
                  // Retry's CoT diverged — switch to showing the new content.
                  chainOfThought.current = retryCoTBuffer.current;
                  retryCoTBuffer.current = null;
                } else {
                  // Still reproducing content already shown — suppress update.
                  suppressUpdate = true;
                }
              } else {
                chainOfThought.current += generationTokens.text;
              }
            }
            if (!suppressUpdate) {
              updateMessageThrottled({
                chainOfThought: chainOfThought.current,
                content: content.current,
                sId,
              });
            }
          }
          break;

        case "agent_action_success":
          const action = eventPayload.data.action;
          const actionStep = eventPayload.data.step;
          mapMessagesWithAutoScroll((m) => {
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
                    toolName: action.toolName ?? null,
                    step: actionStep,
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

          void mutateContextUsage();
          break;

        case "tool_params":
          updateMessageThrottled.cancel();
          const toolParams = eventPayload.data;
          mapMessagesWithAutoScroll((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            const { steps, contentCleared } = flushPendingSegment({
              lastClassification,
              chainOfThought,
              content,
              steps: m.streaming.inlineActivitySteps,
              suffix: `toolparams-${eventPayload.eventId || Date.now()}`,
              stepIndex: toolParams.step,
              retryCoTBuffer,
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
          mapMessagesWithAutoScroll((m) =>
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
          mapMessagesWithAutoScroll((m) => {
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
          isStreamTerminated.current = true;
          updateMessageThrottled.cancel();
          const error = eventPayload.data.error;
          mapMessagesWithAutoScroll((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            const { steps, contentCleared } = flushPendingSegment({
              lastClassification,
              chainOfThought,
              content,
              steps: m.streaming.inlineActivitySteps,
              suffix: `error-${eventPayload.eventId || Date.now()}`,
              stepIndex: currentStep.current ?? 0,
              retryCoTBuffer,
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
          mapMessagesWithAutoScroll((m) =>
            isAgentMessageWithStreaming(m) && m.sId === sId
              ? {
                  ...m,
                  prunedContext: true,
                }
              : m
          );
          break;

        case "agent_generation_cancelled": {
          isStreamTerminated.current = true;
          updateMessageThrottled.cancel();
          const cancelData = eventPayload.data;
          if (cancelData.type !== "agent_generation_cancelled") {
            break;
          }
          mapMessagesWithAutoScroll((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            const { steps, contentCleared } = flushPendingSegment({
              lastClassification,
              chainOfThought,
              content,
              steps: m.streaming.inlineActivitySteps,
              suffix: `cancel-${eventPayload.eventId || Date.now()}`,
              stepIndex: cancelData.step,
              retryCoTBuffer,
            });
            return {
              ...m,
              status: cancelData.status,
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
          isStreamTerminated.current = true;
          updateMessageThrottled.cancel();
          const messageSuccess = eventPayload.data;
          // Trust the server-rendered content view: it is computed from the
          // same persisted step contents reload uses, so it matches reload
          // exactly. If an older server omitted it during a deploy window, fall
          // back to the server's full message (its content/chainOfThought) and
          // keep the live-built steps; this self-heals on the next reload.
          const contentView = messageSuccess.contentView;
          mapMessagesWithAutoScroll((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            return {
              ...m,
              ...getLightAgentMessageFromAgentMessage(messageSuccess.message),
              ...(contentView
                ? {
                    content: contentView.content,
                    chainOfThought: contentView.chainOfThought,
                    activitySteps: contentView.activitySteps,
                  }
                : {}),
              streaming: {
                ...m.streaming,
                agentState: "done",
                inlineActivitySteps:
                  contentView?.activitySteps ?? m.streaming.inlineActivitySteps,
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
    [
      customOnEventCallback,
      mapMessagesWithAutoScroll,
      sId,
      mutateContextUsage,
      updateMessageThrottled,
    ]
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
