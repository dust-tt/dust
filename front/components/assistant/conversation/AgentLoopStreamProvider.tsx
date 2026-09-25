import type { ConversationStreamIds } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import { AgentLoopStreamContext } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  getAgentLoopEventId,
  isTerminalAgentLoopEvent,
  shouldPauseAgentLoopStream,
} from "@app/lib/client/agent_loop_stream";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { useOngoingAgentLoops } from "@app/lib/swr/ongoing_agent_loops";
import type { OngoingAgentLoopType } from "@app/types/api/assistant/conversation/types";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useState } from "react";

interface OngoingAgentLoopConnectionProps {
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
  refreshAgentLoops: () => void;
}

function OngoingAgentLoopConnection({
  owner,
  conversationId,
  messageId,
  refreshAgentLoops,
}: OngoingAgentLoopConnectionProps) {
  const streamId = `message-${messageId}`;
  const buildURL = useCallback(
    (lastEvent: string | null) =>
      `/api/sse/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/events?lastEventId=${encodeURIComponent(getAgentLoopEventId(lastEvent))}`,
    [conversationId, messageId, owner.sId]
  );
  const buildLongPollURL = useCallback(
    (lastEvent: string | null) =>
      `/api/sse/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/events/poll?lastEventId=${encodeURIComponent(getAgentLoopEventId(lastEvent))}`,
    [conversationId, messageId, owner.sId]
  );
  const onEvent = useCallback(
    (event: string) => {
      if (isTerminalAgentLoopEvent(event)) {
        refreshAgentLoops();
      }
    },
    [refreshAgentLoops]
  );

  useEventSource(buildURL, onEvent, streamId, {
    workspaceId: owner.sId,
    buildLongPollURL,
    isPauseEvent: shouldPauseAgentLoopStream,
    isTerminalEvent: isTerminalAgentLoopEvent,
    keepAliveOnUnmount: true,
    replayBufferedEventsOnMount: true,
    telemetryContext: {
      sseKind: "agent_loop",
      conversationId,
      messageId,
    },
  });
  useEffect(
    () => () => eventSourceManager.stopKeepingAlive(streamId, owner.sId),
    [owner.sId, streamId]
  );

  return null;
}

interface AgentLoopStreamProviderProps {
  children: React.ReactNode;
  owner: LightWorkspaceType;
}

/**
 * Keeps SSE connections alive for user-launched agent loops when their conversation UI is not
 * mounted. Temporal workflows maintain the Redis registry that backs the polling endpoint.
 *
 * Redis registry --> adaptive poll --> headless stream subscriber
 *                                           |
 *                           SSE + handshake | long poll fallback
 *                                           v
 * Conversation UI <-- replay and dedupe <-- EventSourceManager
 *
 * The provider creates one headless subscriber per registered message. The global manager shares
 * that stream with the conversation UI and replays buffered events when the UI mounts. Registry
 * polling keeps the subscribers in sync, and a terminal event refreshes it immediately. Polling
 * runs every 10 seconds while loops are active and backs off to 120 seconds when none remain.
 */
/**
 * @cc [owner:id13,label:concurrency;reliability] ongoing-loop-retry-after-refresh
 * Every successful registry refresh MUST offer each listed message to the manager for a bounded
 * resume, even when the registry payload is unchanged. Removed messages MUST lose keepalive.
 */
export function AgentLoopStreamProvider({
  children,
  owner,
}: AgentLoopStreamProviderProps) {
  const [mountedStreamIds, setMountedStreamIds] =
    useState<ConversationStreamIds>(() => new Map());
  const onRegistryRefresh = useCallback(
    (agentLoops: OngoingAgentLoopType[]) => {
      for (const { messageId } of agentLoops) {
        eventSourceManager.resume(`message-${messageId}`);
      }
    },
    []
  );
  const { ongoingAgentLoops, refreshOngoingAgentLoops } = useOngoingAgentLoops({
    workspaceId: owner.sId,
    onSuccess: onRegistryRefresh,
  });
  const registerStream = useCallback(
    (conversationId: string, streamId: string) => {
      setMountedStreamIds((current) => {
        const currentIds = current.get(conversationId);
        if (currentIds?.has(streamId)) {
          return current;
        }
        const next = new Map(current);
        next.set(conversationId, new Set(currentIds).add(streamId));
        return next;
      });

      return () => {
        setMountedStreamIds((current) => {
          const currentIds = current.get(conversationId);
          if (!currentIds?.has(streamId)) {
            return current;
          }
          const next = new Map(current);
          const nextIds = new Set(currentIds);
          nextIds.delete(streamId);
          if (nextIds.size === 0) {
            next.delete(conversationId);
          } else {
            next.set(conversationId, nextIds);
          }
          return next;
        });
      };
    },
    []
  );
  const contextValue = useMemo(() => {
    const conversationStreamIds = new Map(mountedStreamIds);
    for (const { conversationId, messageId } of ongoingAgentLoops) {
      const streamIds = new Set(conversationStreamIds.get(conversationId));
      streamIds.add(`message-${messageId}`);
      conversationStreamIds.set(conversationId, streamIds);
    }
    return { conversationStreamIds, registerStream };
  }, [mountedStreamIds, ongoingAgentLoops, registerStream]);

  useEffect(
    () => () => eventSourceManager.releaseWorkspace(owner.sId),
    [owner.sId]
  );

  return (
    <AgentLoopStreamContext.Provider value={contextValue}>
      {children}
      {ongoingAgentLoops.map(({ conversationId, messageId }) => (
        <OngoingAgentLoopConnection
          key={messageId}
          owner={owner}
          conversationId={conversationId}
          messageId={messageId}
          refreshAgentLoops={refreshOngoingAgentLoops}
        />
      ))}
    </AgentLoopStreamContext.Provider>
  );
}
