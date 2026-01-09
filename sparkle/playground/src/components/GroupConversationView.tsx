import {
  Avatar,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Counter,
  InformationCircleIcon,
  ListGroup,
  ListItem,
  ListItemSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToolsIcon,
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
  _users: User[],
  _agents: Agent[]
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
  _users: User[]
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

// Helper function to categorize conversation by date
function getDateBucket(
  updatedAt: Date
): "Today" | "Yesterday" | "Last Week" | "Last Month" {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const conversationDate = new Date(
    updatedAt.getFullYear(),
    updatedAt.getMonth(),
    updatedAt.getDate()
  );

  if (conversationDate.getTime() >= today.getTime()) {
    return "Today";
  } else if (conversationDate.getTime() >= yesterday.getTime()) {
    return "Yesterday";
  } else if (conversationDate.getTime() >= lastWeek.getTime()) {
    return "Last Week";
  } else {
    return "Last Month";
  }
}

// Helper function to generate more conversations with varied dates
function generateConversationsWithDates(
  conversations: Conversation[],
  count: number
): Conversation[] {
  const now = new Date();
  const generated: Conversation[] = [];

  // Duplicate and vary existing conversations
  for (let i = 0; i < count; i++) {
    const baseConversation = conversations[i % conversations.length];
    const daysAgo = Math.floor(Math.random() * 35); // Up to 35 days ago
    const hoursAgo = Math.floor(Math.random() * 24);
    const minutesAgo = Math.floor(Math.random() * 60);

    const updatedAt = new Date(now);
    updatedAt.setDate(updatedAt.getDate() - daysAgo);
    updatedAt.setHours(updatedAt.getHours() - hoursAgo);
    updatedAt.setMinutes(updatedAt.getMinutes() - minutesAgo);

    const createdAt = new Date(updatedAt);
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 5));

    generated.push({
      ...baseConversation,
      id: `${baseConversation.id}-${i}`,
      updatedAt,
      createdAt,
      title: baseConversation.title,
    });
  }

  return generated;
}

export function GroupConversationView({
  space,
  conversations,
  users,
  agents,
  onConversationClick,
}: GroupConversationViewProps) {
  // Generate more conversations with varied dates
  const expandedConversations = useMemo(() => {
    if (conversations.length === 0) return [];
    // Generate at least 20 conversations, more if we have fewer originals
    const targetCount = Math.max(20, conversations.length * 4);
    return generateConversationsWithDates(conversations, targetCount);
  }, [conversations]);

  // Group conversations by date bucket
  const conversationsByBucket = useMemo(() => {
    const buckets: {
      Today: Conversation[];
      Yesterday: Conversation[];
      "Last Week": Conversation[];
      "Last Month": Conversation[];
    } = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
    };

    expandedConversations.forEach((conversation) => {
      const bucket = getDateBucket(conversation.updatedAt);
      buckets[bucket].push(conversation);
    });

    // Sort each bucket by updatedAt (most recent first)
    Object.keys(buckets).forEach((key) => {
      const bucketKey = key as keyof typeof buckets;
      buckets[bucketKey].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
    });

    return buckets;
  }, [expandedConversations]);

  // Get random users for avatar stack (up to 16)
  const randomUsers = useMemo(() => {
    const shuffled = [...users].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(16, users.length));
  }, [users]);

  const randomUserAvatars = useMemo(() => {
    return randomUsers.map((user) => ({
      name: user.fullName,
      visual: user.portrait,
      isRounded: true,
    }));
  }, [randomUsers]);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background s-px-6">
      {/* Tabs */}
      <Tabs
        defaultValue="conversations"
        className="s-flex s-min-h-0 s-flex-1 s-flex-col s-pt-3"
      >
        <TabsList>
          <TabsTrigger
            value="conversations"
            label="Conversations"
            icon={ChatBubbleLeftRightIcon}
          />
          <TabsTrigger
            value="knowledge"
            label="Knowledge"
            icon={BookOpenIcon}
          />
          <TabsTrigger value="Tools" label="Tools" icon={ToolsIcon} />
          <TabsTrigger
            value="about"
            label="About"
            icon={InformationCircleIcon}
          />
          <div className="s-flex-1" />
          <div className="s-flex s-h-8 s-items-center">
            <Avatar.Stack
              avatars={randomUserAvatars}
              nbVisibleItems={16}
              orientation="horizontal"
              hasMagnifier={false}
              size="xs"
            />
          </div>
        </TabsList>

        {/* Conversations Tab */}
        <TabsContent value="conversations">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto">
            <div className="s-mx-auto s-flex s-w-full s-max-w-3xl s-flex-col s-gap-6 s-py-8">
              {/* New conversation section */}
              <div className="s-flex s-flex-col s-gap-3">
                <h2 className="s-heading-base s-text-foreground dark:s-text-foreground-night">
                  Start a conversation in{" "}
                  <span className="s-italic">"{space.name}"</span>
                </h2>
                <InputBar placeholder="Start a conversation..." />
              </div>

              {/* Conversations list */}
              <div className="s-flex s-flex-col s-gap-3">
                {expandedConversations.length > 0 && (
                  <>
                    <h2 className="s-heading-base s-text-foreground dark:s-text-foreground-night">
                      Activity in{" "}
                      <span className="s-italic">"{space.name}"</span>
                    </h2>
                    <div className="s-flex s-flex-col">
                      {(
                        [
                          "Today",
                          "Yesterday",
                          "Last Week",
                          "Last Month",
                        ] as const
                      ).map((bucketKey) => {
                        const bucketConversations =
                          conversationsByBucket[bucketKey];
                        if (bucketConversations.length === 0) return null;

                        return (
                          <>
                            <ListItemSection>{bucketKey}</ListItemSection>
                            <ListGroup>
                              {bucketConversations.map((conversation) => {
                                const participants = getRandomParticipants(
                                  conversation,
                                  users,
                                  agents
                                );
                                const creator = getRandomCreator(
                                  conversation,
                                  users
                                );
                                const avatarProps =
                                  participantsToAvatarProps(participants);

                                // Format time from updatedAt
                                const time = conversation.updatedAt
                                  .toLocaleTimeString("en-US", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  })
                                  .replace("24:", "00:");

                                // Generate random message count (1-12)
                                const messageCount = Math.floor(
                                  Math.random() * 3 + 1
                                );

                                // Extract base conversation ID if this is an expanded conversation
                                // Expanded IDs have pattern: {baseId}-{number} (e.g., "conv-1-5")
                                // Check if ID matches expanded pattern (ends with -{digits})
                                const expandedIdMatch =
                                  conversation.id.match(/^(.+)-(\d+)$/);
                                const baseConversationId = expandedIdMatch
                                  ? expandedIdMatch[1] // Use the base ID before the last -{number}
                                  : conversation.id; // Use original ID if not expanded

                                // Create a conversation object with the base ID for lookup
                                const conversationForLookup = {
                                  ...conversation,
                                  id: baseConversationId,
                                };

                                return (
                                  <ListItem
                                    key={conversation.id}
                                    onClick={() => {
                                      onConversationClick?.(
                                        conversationForLookup
                                      );
                                    }}
                                    groupName="conversation-item"
                                  >
                                    {creator ? (
                                      <Avatar
                                        name={creator.fullName}
                                        visual={creator.portrait}
                                        size="sm"
                                        isRounded={true}
                                      />
                                    ) : null}
                                    <div className="s-mb-0.5 s-flex s-min-w-0 s-grow s-flex-col s-gap-1">
                                      <div className="s-heading-sm s-flex s-w-full s-items-center s-justify-between s-gap-2 s-text-foreground dark:s-text-foreground-night">
                                        <div className="s-flex s-gap-2">
                                          {creator && creator.fullName}
                                          <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                                            {conversation.title}
                                          </span>
                                        </div>
                                        <div className="s-flex s-items-center s-gap-2 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                                          <span className="s-font-normal">
                                            {time}
                                          </span>
                                          {bucketKey === "Today" && (
                                            <Counter
                                              value={messageCount}
                                              size="xs"
                                              variant="highlight"
                                            />
                                          )}
                                        </div>
                                      </div>
                                      {conversation.description && (
                                        <div className="s-line-clamp-2 s-text-sm s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night">
                                          {conversation.description}
                                        </div>
                                      )}
                                      <div className="s-heading-xs s-flex s-items-center s-gap-2 s-pt-2 s-text-muted-foreground dark:s-text-muted-foreground-night">
                                        {Math.floor(Math.random() * 8) + 1}{" "}
                                        replies
                                        <Avatar.Stack
                                          avatars={avatarProps}
                                          nbVisibleItems={3}
                                          onTop="first"
                                          size="xs"
                                        />
                                      </div>
                                    </div>
                                  </ListItem>
                                );
                              })}
                            </ListGroup>
                          </>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
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
