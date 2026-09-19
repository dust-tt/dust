import { useEventSource } from "@app/hooks/useEventSource";
import {
  getAgentLoopEventId,
  isTerminalAgentLoopEvent,
} from "@app/lib/client/agent_loop_stream";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetOngoingAgentLoopsResponseBody } from "@app/types/api/assistant/conversation/types";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useRef } from "react";
import type { Fetcher } from "swr";

const ONGOING_AGENT_LOOPS_REFRESH_INTERVAL_MS = 3_000;

function OngoingAgentLoopConnection({
  owner,
  conversationId,
  messageId,
  refreshAgentLoops,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
  refreshAgentLoops: () => void;
}) {
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

  useEventSource(buildURL, onEvent, `message-${messageId}`, {
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

  return null;
}

/**
 * Keeps SSE connections alive for user-launched agent loops when their conversation UI is not
 * mounted. Temporal workflows maintain the Redis registry that backs the polling endpoint.
 *
 * Redis registry --> 3 s API poll --> headless SSE subscriber
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
}: {
  children: React.ReactNode;
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const listedStreamIds = useRef(new Set<string>());
  const agentLoopsFetcher: Fetcher<GetOngoingAgentLoopsResponseBody> = fetcher;
  const { data, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/ongoing-agent-loops`,
    agentLoopsFetcher,
    {
      onSuccess: ({ agentLoops }) => {
        const nextStreamIds = new Set<string>();
        for (const { messageId } of agentLoops) {
          const streamId = `message-${messageId}`;
          nextStreamIds.add(streamId);
          eventSourceManager.resume(streamId);
        }
        for (const streamId of listedStreamIds.current) {
          if (!nextStreamIds.has(streamId)) {
            eventSourceManager.stopKeepingAlive(streamId, owner.sId);
          }
        }
        listedStreamIds.current = nextStreamIds;
      },
      refreshInterval: ONGOING_AGENT_LOOPS_REFRESH_INTERVAL_MS,
      refreshWhenHidden: true,
    }
  );
  const refreshAgentLoops = useCallback(() => {
    void mutate();
  }, [mutate]);

  useEffect(
    () => () => eventSourceManager.releaseWorkspace(owner.sId),
    [owner.sId]
  );

  return (
    <>
      {children}
      {data?.agentLoops.map(({ conversationId, messageId }) => (
        <OngoingAgentLoopConnection
          key={messageId}
          owner={owner}
          conversationId={conversationId}
          messageId={messageId}
          refreshAgentLoops={refreshAgentLoops}
        />
      ))}
    </>
  );
}
