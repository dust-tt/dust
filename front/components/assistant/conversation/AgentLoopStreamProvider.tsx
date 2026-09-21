import { useEventSource } from "@app/hooks/useEventSource";
import {
  getAgentLoopEventId,
  isTerminalAgentLoopEvent,
} from "@app/lib/client/agent_loop_stream";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { useOngoingAgentLoops } from "@app/lib/swr/ongoing_agent_loops";
import type { OngoingAgentLoopType } from "@app/types/api/assistant/conversation/types";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect } from "react";

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
      `/api/sse/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/events?lastEventId=${getAgentLoopEventId(lastEvent)}`,
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
 * Redis registry --> 10 s API poll --> headless SSE subscriber
 *                                          |
 *                                          v
 * Conversation UI <-- replay and dedupe <-- EventSourceManager
 *
 * The provider creates one headless subscriber per registered message. The global manager shares
 * that connection with the conversation UI and replays buffered events when the UI mounts. Polling
 * keeps the subscribers in sync with the registry, and a terminal event refreshes it immediately.
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

  useEffect(
    () => () => eventSourceManager.releaseWorkspace(owner.sId),
    [owner.sId]
  );

  return (
    <>
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
    </>
  );
}
