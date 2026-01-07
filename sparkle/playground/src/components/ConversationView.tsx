import {
  Button,
  ConversationContainer,
  ConversationMessage,
  HandThumbDownIcon,
  HandThumbUpIcon,
} from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { getAgentById } from "../data/agents";
import type { Agent, Conversation, Message, User } from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";

interface ConversationViewProps {
  conversation: Conversation;
  locutor: User; // Current user (Locutor)
  users: User[];
  agents: Agent[];
  conversationsWithMessages: Conversation[]; // Conversations that have messages to randomly select from
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    // Format as time if today, otherwise as date
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
}

export function ConversationView({
  conversation,
  locutor,
  users,
  agents,
  conversationsWithMessages,
}: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get messages for this conversation, or randomly select from conversationsWithMessages
  const messagesToDisplay: Message[] = (() => {
    // If conversation has messages, use them
    if (conversation.messages && conversation.messages.length > 0) {
      return conversation.messages;
    }

    // Otherwise, randomly select messages from conversationsWithMessages
    if (conversationsWithMessages.length === 0) {
      return [];
    }

    const randomIndex = Math.floor(
      Math.random() * conversationsWithMessages.length
    );
    const sourceConversation = conversationsWithMessages[randomIndex];
    const sourceMessages = sourceConversation.messages || [];

    if (sourceMessages.length === 0) {
      return [];
    }

    // Map owner IDs to match current conversation participants
    const currentUserParticipants = conversation.userParticipants;
    const currentAgentParticipants = conversation.agentParticipants;

    // Track which user/agent we've mapped to for round-robin distribution
    let userMessageCount = 0;
    let agentMessageCount = 0;
    const otherUsers = currentUserParticipants.filter(
      (id) => id !== locutor.id
    );

    return sourceMessages.map((msg, index) => {
      // Create a deterministic mapping based on message index to ensure consistency
      let newOwnerId = msg.ownerId;
      const newOwnerType = msg.ownerType;

      if (msg.ownerType === "user") {
        // Alternate between locutor and other participants
        // First user message goes to locutor, then cycle through others
        if (userMessageCount === 0 || userMessageCount % 2 === 0) {
          newOwnerId = locutor.id;
        } else {
          // Map to other participants, cycling through available users
          if (otherUsers.length > 0) {
            const mappedIndex =
              Math.floor((userMessageCount - 1) / 2) % otherUsers.length;
            newOwnerId = otherUsers[mappedIndex];
          } else {
            newOwnerId = locutor.id; // Fallback to locutor if no other users
          }
        }
        userMessageCount++;
      } else if (msg.ownerType === "agent") {
        // Map to one of the current conversation's agent participants
        if (currentAgentParticipants.length > 0) {
          const mappedIndex =
            agentMessageCount % currentAgentParticipants.length;
          newOwnerId = currentAgentParticipants[mappedIndex];
        } else {
          // If no agents in current conversation, keep original agent
          newOwnerId = msg.ownerId;
        }
        agentMessageCount++;
      }

      return {
        ...msg,
        id: `${conversation.id}-msg-${index}`,
        ownerId: newOwnerId,
        ownerType: newOwnerType,
      };
    });
  })();

  // Auto-scroll to bottom on mount and when conversation changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.id, messagesToDisplay.length]);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-overflow-hidden">
      {/* Messages container - scrollable */}
      <div
        ref={scrollContainerRef}
        className="s-flex s-flex-1 s-flex-col s-overflow-y-auto"
      >
        <ConversationContainer>
          {messagesToDisplay.map((message) => {
            const isLocutor = message.ownerId === locutor.id;
            let owner: User | Agent | undefined;
            let pictureUrl: string | undefined;
            let name: string;

            if (message.ownerType === "user") {
              owner =
                getUserById(message.ownerId) ||
                users.find((u) => u.id === message.ownerId);
              if (owner) {
                pictureUrl = owner.portrait;
                name = owner.fullName;
              } else {
                name = "Unknown User";
              }
            } else {
              owner =
                getAgentById(message.ownerId) ||
                agents.find((a) => a.id === message.ownerId);
              if (owner) {
                name = owner.name;
                pictureUrl = undefined; // Avatar will show name initials
              } else {
                name = "Unknown Agent";
              }
            }

            // Determine message alignment
            // Locutor's messages are type "user" and should align right
            // Other users' messages are type "user" but align left
            // Agent messages are type "agent" and align left
            const messageType = message.type;
            const isUserMessage = messageType === "user";
            const isFromLocutor = isUserMessage && isLocutor;

            return (
              <div
                key={message.id}
                className={
                  isFromLocutor
                    ? "s-flex s-w-full s-justify-end"
                    : "s-flex s-w-full s-justify-start"
                }
              >
                <div
                  className={
                    isFromLocutor
                      ? "s-flex s-w-full s-max-w-[85%] s-justify-end"
                      : "s-flex s-w-full s-max-w-[85%] s-justify-start"
                  }
                >
                  <ConversationMessage
                    type={messageType}
                    name={name}
                    emoji={owner && "emoji" in owner ? owner.emoji : undefined}
                    backgroundColor={
                      owner && "emoji" in owner
                        ? owner.backgroundColor
                        : undefined
                    }
                    pictureUrl={pictureUrl}
                    timestamp={formatTimestamp(message.timestamp)}
                    buttons={
                      messageType === "agent"
                        ? [
                            <Button
                              key="thumb-up"
                              icon={HandThumbUpIcon}
                              onClick={() => {}}
                              size="xs"
                              variant="outline"
                            />,
                            <Button
                              key="thumb-down"
                              icon={HandThumbDownIcon}
                              onClick={() => {}}
                              size="xs"
                              variant="outline"
                            />,
                          ]
                        : undefined
                    }
                  >
                    {message.content}
                  </ConversationMessage>
                </div>
              </div>
            );
          })}
          <div className="s-fixed s-bottom-4 s-w-full">
            <InputBar placeholder="Ask a question" className="s-shadow-xl" />
          </div>
          <div ref={messagesEndRef} />
        </ConversationContainer>
      </div>
    </div>
  );
}
