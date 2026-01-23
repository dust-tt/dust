import { useCallback } from "react";

import { useEventSource } from "@app/hooks/useEventSource";
import type { LightWorkspaceType } from "@app/types";

export type ConversationEventCallback = (eventStr: string) => void;

export function useConversationEvents({
  owner,
  conversationId,
  onEvent,
  isReadyToConsumeStream,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
  onEvent: ConversationEventCallback;
  isReadyToConsumeStream: boolean;
}) {
  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!conversationId) {
        return null;
      }

      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      const url = esURL + "?lastEventId=" + lastEventId;

      return url;
    },
    [owner.sId, conversationId]
  );

  useEventSource(
    buildEventSourceURL,
    onEvent,
    conversationId ? `conversation-${conversationId}` : "",
    {
      isReadyToConsumeStream,
    }
  );
}
