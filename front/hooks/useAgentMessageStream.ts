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
export function appendThinkingStep(
  steps: InlineActivityStep[],
  cotContent: string,
  id: string
): InlineActivityStep[] {
  // Replay idempotence: ids derive from the originating event id, so a
  // replayed event maps to the same id and must not duplicate the step.
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
  return [...steps, { type: "thinking", content: cotContent, id }];
}

function appendContentStep(
  steps: InlineActivityStep[],
  textContent: string,
  id: string
): InlineActivityStep[] {
  // Replay idempotence: see appendThinkingStep.
  if (steps.some((step) => step.id === id)) {
    return steps;
  }
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
  // already saw (e.g. just past the cursor boundary), this short-circuits the
  // re-processing. Step appends are additionally idempotent (ids derive from
  // event ids), so replays that cross hook remounts — where this set starts
  // empty but the Virtuoso message state is retained — converge instead of
  // duplicating steps.
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

  // `streamId` changes when the stream is manually reloaded (e.g.
  // `reloadMessage` in AgentMessage after a stream error): the new stream
  // replays the event history from scratch, so all per-stream state must be
  // reset. Without this, `seenEventIds` silently drops every replayed event
  // against the freshly reset message (message stuck on "Thinking" until a
  // page reload) and the terminal latch can prevent the new connection
  // entirely. Guarded render-time adjustment, same pattern as deriving state
  // from prop changes.
  const lastStreamId = useRef(streamId);
  if (lastStreamId.current !== streamId) {
    lastStreamId.current = streamId;
    seenEventIds.current = new Set();
    isStreamTerminated.current = false;
    lastClassification.current = null;
    lastCoTTraceId.current = null;
    retryCoTBuffer.current = null;
    chainOfThought.current = agentMessage.chainOfThought ?? "";
    content.current = agentMessage.content ?? "";
    isFreshMountWithContent.current =
      shouldStream && (!!agentMessage.content || !!agentMessage.chainOfThought);
  }

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
      // Deterministic suffix for inline activity step ids, derived from the
      // SSE event id (Redis stream id): stable across replays and remounts,
      // so re-processing an event upserts instead of duplicating. Falls back
      // to a timestamp for events without an id.
      const eventIdSuffix = eventPayload.eventId || String(Date.now());
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
                  suffix: `pre-${eventIdSuffix}`,
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
              suffix: `toolparams-${eventIdSuffix}`,
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
              suffix: `error-${eventIdSuffix}`,
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
              suffix: `cancel-${eventIdSuffix}`,
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
          // Flush any remaining CoT (but not content — the final text segment
          // becomes the message body via the server's canonical message).
          const cotAtSuccess = chainOfThought.current;
          chainOfThought.current = "";
          retryCoTBuffer.current = null;
          // content.current tracks only the final text segment (intermediate
          // segments were flushed to content steps). The server's full message
          // includes ALL text, so we override with the tracked final segment.
          // Only override when final answer tokens were actually streamed.
          // Reasoning/activity-only streams still receive the canonical answer
          // in the success payload; overriding those with the empty token
          // buffer would hide the final generation until reload.
          const finalSegment = content.current;
          const hadStreamedTokens = lastClassification.current === "tokens";
          lastClassification.current = null;
          mapMessagesWithAutoScroll((m) => {
            if (!isAgentMessageWithStreaming(m) || m.sId !== sId) {
              return m;
            }
            let steps = cotAtSuccess
              ? appendThinkingStep(
                  m.streaming.inlineActivitySteps,
                  cotAtSuccess,
                  `thinking-final-${eventIdSuffix}`
                )
              : m.streaming.inlineActivitySteps;
            // When no tokens streamed after the last tool call (e.g. the agent
            // handed off or otherwise terminated right after a tool), the text
            // we flushed as a content step at the last `tool_params` is also
            // what the server keeps as the message body. Drop that trailing
            // content step so the same text isn't rendered twice — aligning
            // with `contentsToActivitySteps`, which is what runs after reload.
            if (!hadStreamedTokens) {
              for (let i = steps.length - 1; i >= 0; i--) {
                if (steps[i].type === "content") {
                  steps = [...steps.slice(0, i), ...steps.slice(i + 1)];
                  break;
                }
              }
            }
            return {
              ...m,
              ...getLightAgentMessageFromAgentMessage(messageSuccess.message),
              ...(hadStreamedTokens ? { content: finalSegment || null } : {}),
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
