import { useEffect, useState } from "react";

import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import {
  AgentMessageNewEvent,
  UserMessageNewEvent,
} from "@app/lib/api/assistant/conversation";
import { useConversation } from "@app/lib/swr";
import { WorkspaceType } from "@app/types/user";

export default function Conversation({
  conversationId,
  owner,
}: {
  conversationId: string;
  owner: WorkspaceType;
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
  // state use to re-connect to the events stream.
  // this is a hack to re-trigger the useEffect below
  const [reconnectCounter, setReconnectCounter] = useState(0);

  useEffect(() => {
    if (!conversation) {
      return;
    }
    const messageIds = new Set(
      conversation?.content.flatMap((m) => m.map((mm) => mm.sId))
    );
    let mutateTimeout: NodeJS.Timeout | null = null;
    const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/events`;
    const es = new EventSource(esURL);
    es.onmessage = (event: MessageEvent<string>) => {
      const eventPayload: {
        eventId: string;
        data: UserMessageNewEvent | AgentMessageNewEvent;
      } = JSON.parse(event.data);
      if (conversation && !messageIds.has(eventPayload.data.message.sId)) {
        mutateTimeout && clearTimeout(mutateTimeout);
        mutateTimeout = setTimeout(() => {
          void mutateConversation();
        }, 300);
      }
    };

    es.onerror = () => {
      setReconnectCounter((c) => c + 1);
    };

    return () => {
      es.close();
    };
  }, [
    conversation,
    conversationId,
    mutateConversation,
    owner.sId,
    reconnectCounter,
  ]);

  if (isConversationLoading) {
    return <div>Loading conversation...</div>;
  } else if (isConversationError) {
    return <div>Error loading conversation</div>;
  }
  if (!conversation) {
    return <div>No conversation here</div>;
  }

  return (
    <div className="flex-col gap-6 ">
      {conversation.content.map((message) =>
        message.map((m) => {
          switch (m.type) {
            case "user_message":
              return (
                <div
                  key={`message-id-${m.sId}`}
                  className="bg-structure-50 py-6"
                >
                  <div className="mx-auto flex max-w-4xl gap-4 px-6">
                    <UserMessage message={m} />;
                  </div>
                </div>
              );
            case "agent_message":
              return (
                <div key={`message-id-${m.sId}`} className="py-6">
                  <div className="mx-auto flex max-w-4xl gap-4 px-6">
                    agentMessage:
                    {m.configuration.name} {m.content}
                  </div>
                </div>
              );
            default:
              ((message: never) => {
                console.error("Unknown message type", message);
              })(m);
          }
        })
      )}
    </div>
  );
}
