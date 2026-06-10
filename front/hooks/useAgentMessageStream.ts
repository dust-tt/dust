import type {
  AgentMessageStateWithControlEvent,
  AgentMessageWithStreaming,
  PendingToolCall,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isAgentMessageWithStreaming,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import { useConversationContextUsage } from "@app/hooks/conversations";
import { useEventSource } from "@app/hooks/useEventSource";
import type { ToolNotificationEvent } from "@app/lib/actions/mcp";
import { getActionOneLineLabel } from "@app/lib/api/assistant/activity_steps";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { FetchConversationMessageResponseLight } from "@app/lib/api/assistant/messages";
import { clientFetch } from "@app/lib/egress/client";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  InlineActivityStep,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import {
  isLightAgentMessageType,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import throttle from "lodash/throttle";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

const TOKEN_BUFFER_THRESHOLD_MS = 500;

// Stale-stream watchdog (see effect in useAgentMessageStream): how often we
// check for a silent stream, and how long the stream must have been silent
// before we reconcile against the persisted message. A healthy live stream
// delivers events far more often than the threshold; a stream waiting on a
// long silent tool call legitimately goes quiet, in which case the
// reconciliation fetch is a cheap no-op (the persisted status is still
// "created").
const STALE_STREAM_CHECK_INTERVAL_MS = 30_000;
const STALE_STREAM_RECONCILE_THRESHOLD_MS = 60_000;

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
          // Enable auto scroll if we are starting to receive content or chain of thought.
          if (
            (!m.content && content) ||
            (!m.chainOfThought && chainOfThought)
          ) {
            isAutoScrollEnabledRef.current = true;
          }
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
 * Append a thinking step to the inline activity steps if the content
 * is new (not a duplicate of the last thinking step).
 */
export function appendThinkingStep(
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
  retryCoTBuffer,
}: {
  lastClassification: { current: "tokens" | "chain_of_thought" | null };
  chainOfThought: { current: string };
  content: { current: string };
  steps: InlineActivityStep[];
  suffix: string;
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
      steps: appendThinkingStep(steps, cotToFlush, `thinking-${suffix}`),
      contentCleared: false,
    };
  }
  if (cls === "tokens" && content.current) {
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

  // Short-circuit replays of events we've already processed in this hook
  // instance. The hook is mounted per agent message (via AgentMessage.tsx),
  // so the ref is scoped to a single message and resets on remount or when a
  // retry creates a new agentMessage.sId. Within a single mount,
  // `useEventSource` reconnects on every server-side "done" frame and on
  // network errors using `lastEventId`; if the server replays an event we
  // already saw (e.g. just past the cursor boundary), the handlers downstream
  // are not idempotent — inline activity step IDs are built from `Date.now()`
  // and same-millisecond re-processing produces duplicate React keys.
  const seenEventIds = useRef<Set<string>>(new Set());

  // Once a terminal event (agent_message_success, agent_error, etc.) is
  // received, we must stop reconnecting entirely. Without this, a race between
  // Virtuoso's deferred item re-render (which updates `agentMessage.status` and
  // flips `shouldStream` to false) and the immediate React re-render triggered
  // by the SSE `done` frame causes the effect to fire with `shouldStream` still
  // true, reconnecting to the server. The server then replays history including
  // `end-of-stream`, after which every subsequent reconnect gets an empty
  // history and another immediate `done`, producing an infinite loop.
  // Returning null from buildEventSourceURL breaks the loop at the source.
  const isStreamTerminated = useRef(false);

  // Timestamp of the last SSE event actually processed (not deduplicated) for
  // this message. Used by the stale-stream watchdog below to detect a stream
  // that looks alive from the connection's point of view but no longer
  // delivers events.
  const lastEventReceivedAt = useRef<number>(Date.now());
  const isReconcileInFlight = useRef(false);

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
      lastEventReceivedAt.current = Date.now();
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
              }
              if (newTraceId) {
                lastCoTTraceId.current = newTraceId;
              }
            }

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
                  suffix: `pre-${Date.now()}`,
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
              suffix: `toolparams-${Date.now()}`,
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
              suffix: `error-${Date.now()}`,
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
              suffix: `cancel-${Date.now()}`,
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

  // Stale-stream watchdog — self-healing safety net for the "infinite
  // streaming" class of bugs.
  //
  // The Virtuoso entry for a message is only ever finalized by a terminal SSE
  // event (agent_message_success & co). If the client permanently misses that
  // event, the message stays visually "streaming" until a full page reload,
  // even though the agent finished long ago. There are real-world ways to
  // permanently miss it: the Redis stream backing replays has a 10-minute TTL
  // (a laptop asleep / tab frozen / network partition longer than that and
  // the terminal event is gone from history), transient pub/sub delivery loss
  // right before the stream expires, or any future client-side race — several
  // have been fixed already and the class keeps resurfacing.
  //
  // Instead of chasing each trigger, reconcile with the source of truth: when
  // the stream has been silent for STALE_STREAM_RECONCILE_THRESHOLD_MS while
  // the message is still "created", fetch the persisted message. If it
  // reached a terminal status, apply the server-rendered view (the exact data
  // a reload would show) and terminate the stream. If it is still running
  // (long tool call, pending validation, ...), this is a no-op and the live
  // stream is left untouched.
  useEffect(() => {
    if (!shouldStream || !conversationId) {
      return;
    }

    const reconcileWithPersistedMessage = async () => {
      if (isStreamTerminated.current || isReconcileInFlight.current) {
        return;
      }
      if (
        Date.now() - lastEventReceivedAt.current <
        STALE_STREAM_RECONCILE_THRESHOLD_MS
      ) {
        return;
      }
      isReconcileInFlight.current = true;
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${sId}?viewType=light`
        );
        if (!response.ok) {
          return;
        }
        const { message }: FetchConversationMessageResponseLight =
          await response.json();
        if (
          !isLightAgentMessageType(message) ||
          message.sId !== sId ||
          !isTerminalAgentMessageStatus(message.status)
        ) {
          // The agent is genuinely still running — leave the live stream
          // alone and let the next tick check again.
          return;
        }
        // A terminal event may have raced us while the fetch was in flight;
        // it already finalized the message, nothing left to do.
        if (isStreamTerminated.current) {
          return;
        }
        isStreamTerminated.current = true;
        updateMessageThrottled.cancel();
        methods.data.map((m) =>
          isAgentMessageWithStreaming(m) && m.sId === sId
            ? makeInitialMessageStreamState(message)
            : m
        );
      } catch {
        // Network errors are fine to swallow: the next watchdog tick retries.
      } finally {
        isReconcileInFlight.current = false;
      }
    };

    const intervalId = setInterval(
      () => void reconcileWithPersistedMessage(),
      STALE_STREAM_CHECK_INTERVAL_MS
    );

    // Coming back from sleep / app switch is the most common way to end up
    // past the replay window — check immediately instead of waiting for the
    // next tick (the staleness threshold still gates the actual fetch).
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcileWithPersistedMessage();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    shouldStream,
    conversationId,
    owner.sId,
    sId,
    methods,
    updateMessageThrottled,
  ]);

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
