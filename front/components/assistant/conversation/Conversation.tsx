import { useCallback, useEffect, useRef } from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageNewEvent,
} from "@app/lib/api/assistant/conversation";
import { useConversation, useConversations } from "@app/lib/swr";
import {
  AgentMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

export default function Conversation({
  owner,
  conversationId,
}: {
  owner: WorkspaceType;
  conversationId: string;
}) {
  const {
    conversation,
    isConversationError,
    isConversationLoading,
    mutateConversation,
  } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (window && window.scrollTo) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [conversation?.content.length]);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
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
    [conversationId, owner.sId]
  );

  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data:
          | UserMessageNewEvent
          | AgentMessageNewEvent
          | ConversationTitleEvent;
      } = JSON.parse(eventStr);

      const event = eventPayload.data;

      if (!eventIds.current.includes(eventPayload.eventId)) {
        eventIds.current.push(eventPayload.eventId);
        switch (event.type) {
          case "user_message_new":
          case "agent_message_new":
            void mutateConversation();
            break;
          case "conversation_title": {
            void mutateConversation();
            void mutateConversations(); // to refresh the list of convos in the sidebar
            break;
          }
          default:
            ((t: never) => {
              console.error("Unknown event type", t);
            })(event);
        }
      }
    },
    [mutateConversation, mutateConversations]
  );

  useEventSource(buildEventSourceURL, onEventCallback);
  const eventIds = useRef<string[]>([]);

  if (isConversationLoading) {
    return null;
  } else if (isConversationError) {
    return <div>Error loading conversation</div>;
  }
  if (!conversation) {
    return <div>No conversation here</div>;
  }

  return (
    <div className="pb-24">
      {conversation.content.map((versionedMessages) => {
        // Lots of typing because of the reduce which Typescript
        // doesn't handle well on union types
        const m = (versionedMessages as any[]).reduce(
          (
            acc: UserMessageType | AgentMessageType,
            cur: UserMessageType | AgentMessageType
          ) => (cur.version > acc.version ? cur : acc)
        ) as UserMessageType | AgentMessageType;

        if (m.visibility === "deleted") {
          return null;
        }
        switch (m.type) {
          case "user_message":
            return (
              <div
                key={`message-id-${m.sId}`}
                className="border-t border-structure-100 bg-structure-50 px-2 py-6"
              >
                <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  <UserMessage
                    message={m}
                    conversation={conversation}
                    owner={owner}
                  />
                </div>
              </div>
            );
          case "agent_message":
            return (
              <div
                key={`message-id-${m.sId}`}
                className="border-t border-structure-100 px-2 py-6"
              >
                <div className="mx-auto flex max-w-4xl gap-4">
                  <AgentMessage
                    message={m}
                    owner={owner}
                    conversationId={conversationId}
                  />
                </div>
              </div>
            );
          default:
            ((message: never) => {
              console.error("Unknown message type", message);
            })(m);
        }
      })}
    </div>
  );
}
