import { eventSourceManager } from "@app/lib/client/event_source_manager";
import type { EventSourceConnectionState } from "@app/types/event_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

const EMPTY_STREAM_IDS = new Map<string, string>();

export const AgentLoopStreamContext =
  createContext<ReadonlyMap<string, string>>(EMPTY_STREAM_IDS);

export function isAgentLoopStreamActive(
  state: EventSourceConnectionState
): boolean {
  switch (state.kind) {
    case "connecting":
    case "long_polling":
    case "open":
    case "reconnecting":
      return true;
    case "failed":
    case "idle":
    case "terminal":
      return false;
    default:
      assertNeverAndIgnore(state);
      return false;
  }
}

/**
 * @cc [owner:id13,label:product;architecture] sidebar-stream-indicator-state
 * The conversation sidebar streaming indicator MUST reflect the manager's live connection state.
 * Persisted conversation running state MUST NOT keep the indicator active after transport failure.
 */
export function useIsAgentLoopStreaming(conversationId: string): boolean {
  const streamId = useContext(AgentLoopStreamContext).get(conversationId);
  const subscribe = useCallback(
    (listener: () => void) =>
      streamId
        ? eventSourceManager.subscribeToConnectionState(streamId, listener)
        : () => undefined,
    [streamId]
  );
  const getSnapshot = useCallback(
    () =>
      streamId
        ? isAgentLoopStreamActive(
            eventSourceManager.getConnectionState(streamId)
          )
        : false,
    [streamId]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
