import { useEventSource } from "@app/hooks/useEventSource";
import type { LiveTaskUpdate } from "@app/lib/client/live_task";
import { LiveTaskRelay } from "@app/lib/client/live_task";
import { useCallback, useMemo } from "react";

export function useLiveTaskStream({
  workspaceId,
  conversationId,
  messageId,
  onUpdate,
  onEnd,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string | null;
  onUpdate: (update: LiveTaskUpdate) => void;
  onEnd: () => void;
}) {
  const relay = useMemo(() => new LiveTaskRelay(messageId ?? ""), [messageId]);
  const buildURL = useCallback(() => {
    if (!messageId || relay.ended) {
      return null;
    }
    return `/api/sse/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/events?lastEventId=${encodeURIComponent(relay.lastEventId)}`;
  }, [workspaceId, conversationId, messageId, relay]);
  const onEvent = useCallback(
    (raw: string) => {
      for (const update of relay.receive(raw)) {
        onUpdate(update);
      }
      if (relay.ended) {
        onEnd();
      }
    },
    [relay, onUpdate, onEnd]
  );

  useEventSource(
    buildURL,
    onEvent,
    `live:${workspaceId}:${conversationId}:${messageId}`,
    {
      isReadyToConsumeStream: !!messageId,
    }
  );
  return relay;
}
