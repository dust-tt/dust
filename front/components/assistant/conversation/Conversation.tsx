import { useCallback, useEffect, useRef } from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageNewEvent,
} from "@app/lib/api/assistant/conversation";
import { useAgentConfigurations, useConversation } from "@app/lib/swr";
import {
  AgentMessageType,
  UserMessageType,
  isAgentMention,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";
import { Button, DropdownMenu, RobotIcon } from "@dust-tt/sparkle";
import { AgentConfigurationType } from "@app/types/assistant/agent";

export default function Conversation({
  owner,
  conversationId,
  onTitleUpdate,
}: {
  owner: WorkspaceType;
  conversationId: string;
  onTitleUpdate: (title: string | null) => void;
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
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (window && window.scrollTo) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [conversation?.content.length]);

  useEffect(() => {
    onTitleUpdate(conversation?.title ?? null);
  }, [conversation?.title, onTitleUpdate]);

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
          case "conversation_title": {
            void mutateConversation();
            break;
          }
          default:
            ((t: never) => {
              console.error("Unknown event type", t);
            })(event);
        }
      }
    },
    [mutateConversation]
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
              <div key={`message-id-${m.sId}`} className="bg-structure-50 py-6">
                <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  <UserMessage message={m}>
                    {m.mentions.length === 0 && (
                      <AgentSuggestion userMessage={m} />
                    )}
                  </UserMessage>
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

  function AgentSuggestion({ userMessage }: { userMessage: UserMessageType }) {
    agentConfigurations.sort((a, b) => compareAgentSuggestions(a, b));

    return (
      <div className="mt-2">
        <div className="text-xs font-bold text-element-600">
          Which KillerZorg would you like to talk with?
        </div>
        <div className="mt-2 flex items-center gap-2">
          {agentConfigurations.slice(0, 3).map((agent) => (
            <Button
              key={`message-${userMessage.sId}-suggestion-${agent.sId}`}
              size="xs"
              variant="tertiary"
              label={`@${agent.name}`}
              onClick={() => console.log(agent)}
              icon={() => (
                <img
                  className="h-5 w-5 rounded rounded-xl"
                  src={agent.pictureUrl}
                />
              )}
            />
          ))}
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                variant="tertiary"
                size="xs"
                icon={RobotIcon}
                label="Select another"
              />
            </DropdownMenu.Button>
            <div className="relative bottom-6 z-30">
              <DropdownMenu.Items origin="topLeft" width={320}>
                {agentConfigurations.slice(3).map((agent) => (
                  <DropdownMenu.Item
                    key={`message-${userMessage.sId}-suggestion-${agent.sId}`}
                    label={agent.name}
                    visual={agent.pictureUrl}
                  />
                ))}
              </DropdownMenu.Items>
            </div>
          </DropdownMenu>
        </div>
      </div>
    );

    /**
     * Compare agents by whom was last mentioned in conversation from this user.
     * If none has been mentioned, dust comes first, then gpt4 , then custom
     * agents (in any order), then global agents with a specific source, then
     * claude, then the rest
     */
    function compareAgentSuggestions(
      a: AgentConfigurationType,
      b: AgentConfigurationType
    ) {
      // index of last user message in conversation mentioning agent a
      const aIndex = conversation!.content.findLastIndex((ms) =>
        ms.some(
          (m) =>
            isUserMessageType(m) &&
            m.user?.id === userMessage.user?.id &&
            m.mentions.some(
              (mention) =>
                isAgentMention(mention) && mention.configurationId === a.sId
            )
        )
      );
      // index of last user message in conversation mentioning agent b
      const bIndex = conversation!.content.findLastIndex((ms) =>
        ms.some(
          (m) =>
            isUserMessageType(m) &&
            m.user?.id === userMessage.user?.id &&
            m.mentions.some(
              (mention) =>
                isAgentMention(mention) && mention.configurationId === b.sId
            )
        )
      );
      //
      if (aIndex === -1 && bIndex === -1) {
        // if neither a nor b was mentioned, dust comes first, then gpt4
        if (a.name === "Dust") {
          return -1;
        }
        if (b.name === "Dust") {
          return 1;
        }
        if (a.name === "gpt4") {
          return -1;
        }
        if (b.name === "gpt4") {
          return 1;
        }
        // custom agents come next
        if (a.scope === "workspace") {
          return -1;
        }
        if (b.scope === "workspace") {
          return 1;
        }
        // datasource-specific global agents come next
        if (a.action?.dataSources.length === 1) {
          return -1;
        }
        if (a.action?.dataSources.length === 1) {
          return 1;
        }
        // claude comes next
        if (a.name === "claude") {
          return -1;
        }
        if (b.name === "claude") {
          return 1;
        }
        // the rest
        return 0;
      }

      // sort by largest index first
      return bIndex - aIndex;
    }
  }
}
