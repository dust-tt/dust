import {
  Avatar,
  ContextItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { getAgentById } from "../data/agents";
import type { Agent, Conversation, Space, User } from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";

interface GroupConversationViewProps {
  space: Space;
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  onConversationClick?: (conversation: Conversation) => void;
}

// Helper function to get random participants for a conversation
function getRandomParticipants(
  conversation: Conversation,
  users: User[],
  agents: Agent[]
): Array<{ type: "user" | "agent"; data: User | Agent }> {
  const allParticipants: Array<{ type: "user" | "agent"; data: User | Agent }> =
    [];

  // Add user participants
  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      allParticipants.push({ type: "user", data: user });
    }
  });

  // Add agent participants
  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      allParticipants.push({ type: "agent", data: agent });
    }
  });

  // Shuffle and select 1-6 participants
  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const count = Math.min(
    Math.max(1, Math.floor(Math.random() * 6) + 1),
    shuffled.length
  );
  return shuffled.slice(0, count);
}

// Helper function to get random creator from people
function getRandomCreator(
  conversation: Conversation,
  users: User[]
): User | null {
  if (conversation.userParticipants.length === 0) {
    return null;
  }
  const creatorId =
    conversation.userParticipants[
      Math.floor(Math.random() * conversation.userParticipants.length)
    ];
  return getUserById(creatorId) || null;
}

// Convert participants to Avatar props format for Avatar.Stack
function participantsToAvatarProps(
  participants: Array<{ type: "user" | "agent"; data: User | Agent }>
) {
  return participants.map((participant) => {
    if (participant.type === "user") {
      const user = participant.data as User;
      return {
        name: user.fullName,
        visual: user.portrait,
        isRounded: true,
      };
    } else {
      const agent = participant.data as Agent;
      return {
        name: agent.name,
        emoji: agent.emoji,
        backgroundColor: agent.backgroundColor,
        isRounded: false,
      };
    }
  });
}

export function GroupConversationView({
  space,
  conversations,
  users,
  agents,
  onConversationClick,
}: GroupConversationViewProps) {
  // Sort conversations by updatedAt (most recent first)
  const sortedConversations = useMemo(() => {
    return [...conversations].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }, [conversations]);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background">
      {/* Title */}
      <div className="s-border-b s-border-border s-px-6 s-py-4 dark:s-border-border-night">
        <h1 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
          {space.name}
        </h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conversations" className="s-flex s-flex-1 s-flex-col">
        <TabsList className="s-px-6">
          <TabsTrigger value="conversations" label="Conversations" />
          <TabsTrigger value="knowledge" label="Knowledge Tools" />
          <TabsTrigger value="about" label="About" />
        </TabsList>

        {/* Conversations Tab */}
        <TabsContent
          value="conversations"
          className="s-flex s-flex-1 s-flex-col s-overflow-hidden"
        >
          <div className="s-flex s-flex-1 s-flex-col s-gap-6 s-overflow-y-auto s-px-6 s-py-6">
            {/* New conversation section */}
            <div className="s-flex s-flex-col s-gap-3">
              <h2 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                New conversation
              </h2>
              <InputBar placeholder="Start a conversation..." />
            </div>

            {/* Conversations list */}
            <div className="s-flex s-flex-col s-gap-3">
              <h2 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                Conversations in {space.name}
              </h2>
              {sortedConversations.length > 0 ? (
                <ContextItem.List>
                  {sortedConversations.map((conversation) => {
                    const participants = getRandomParticipants(
                      conversation,
                      users,
                      agents
                    );
                    const creator = getRandomCreator(conversation, users);
                    const avatarProps = participantsToAvatarProps(participants);

                    return (
                      <ContextItem
                        key={conversation.id}
                        title={
                          <div className="s-flex s-items-center s-gap-2">
                            {creator ? (
                              <>
                                <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                                  {creator.fullName}
                                </span>
                                <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                                  -
                                </span>
                                <span>{conversation.title}</span>
                              </>
                            ) : (
                              <span>{conversation.title}</span>
                            )}
                          </div>
                        }
                        visual={
                          <Avatar.Stack
                            avatars={avatarProps}
                            nbVisibleItems={4}
                            size="sm"
                          />
                        }
                        onClick={() => {
                          onConversationClick?.(conversation);
                        }}
                      >
                        {conversation.description && (
                          <ContextItem.Description
                            description={conversation.description}
                          />
                        )}
                      </ContextItem>
                    );
                  })}
                </ContextItem.List>
              ) : (
                <div className="s-flex s-items-center s-justify-center s-py-12">
                  <p className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                    No conversations in this space yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Knowledge Tools Tab */}
        <TabsContent
          value="knowledge"
          className="s-flex s-flex-1 s-flex-col s-overflow-y-auto s-px-6 s-py-6"
        >
          <div className="s-text-foreground dark:s-text-foreground-night">
            Knowledge Tools content coming soon...
          </div>
        </TabsContent>

        {/* About Tab */}
        <TabsContent
          value="about"
          className="s-flex s-flex-1 s-flex-col s-overflow-y-auto s-px-6 s-py-6"
        >
          <div className="s-flex s-flex-col s-gap-4">
            <h2 className="s-heading-xl s-text-foreground dark:s-text-foreground-night">
              About {space.name}
            </h2>
            <p className="s-text-foreground dark:s-text-foreground-night">
              {space.description}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

