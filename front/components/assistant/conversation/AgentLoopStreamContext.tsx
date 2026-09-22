import { eventSourceManager } from "@app/lib/client/event_source_manager";
import type { EventSourceConnectionState } from "@app/types/event_source";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

export type ConversationStreamIds = ReadonlyMap<string, ReadonlySet<string>>;

interface AgentLoopStreamContextValue {
  conversationStreamIds: ConversationStreamIds;
  registerStream: (conversationId: string, streamId: string) => () => void;
}

const EMPTY_STREAM_IDS: ConversationStreamIds = new Map();
const EMPTY_CONTEXT_VALUE: AgentLoopStreamContextValue = {
  conversationStreamIds: EMPTY_STREAM_IDS,
  registerStream: () => () => undefined,
};

export const AgentLoopStreamContext =
  createContext<AgentLoopStreamContextValue>(EMPTY_CONTEXT_VALUE);

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
 * The conversation sidebar streaming indicator MUST be active while any registry or mounted
 * message stream for that conversation has a live manager connection. Persisted conversation
 * running state MUST NOT keep the indicator active after transport failure.
 */
export function useIsAgentLoopStreaming(conversationId: string): boolean {
  const streamIds = useContext(
    AgentLoopStreamContext
  ).conversationStreamIds.get(conversationId);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribers = Array.from(streamIds ?? [], (streamId) =>
        eventSourceManager.subscribeToConnectionState(streamId, listener)
      );
      return () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
      };
    },
    [streamIds]
  );
  const getSnapshot = useCallback(
    () =>
      Array.from(streamIds ?? []).some((streamId) =>
        isAgentLoopStreamActive(eventSourceManager.getConnectionState(streamId))
      ),
    [streamIds]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

interface UseRegisterAgentLoopStreamParams {
  conversationId: string | null;
  enabled: boolean;
  streamId: string;
}

export function useRegisterAgentLoopStream({
  conversationId,
  enabled,
  streamId,
}: UseRegisterAgentLoopStreamParams): void {
  const { registerStream } = useContext(AgentLoopStreamContext);

  useEffect(() => {
    if (!conversationId || !enabled) {
      return;
    }
    return registerStream(conversationId, streamId);
  }, [conversationId, enabled, registerStream, streamId]);
}
