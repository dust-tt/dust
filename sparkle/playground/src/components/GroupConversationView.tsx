import {
  Avatar,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ConversationListItem,
  InformationCircleIcon,
  ListGroup,
  ListItemSection,
  ReplySection,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToolsIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

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
  showToolsAndAboutTabs?: boolean;
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
  showToolsAndAboutTabs = false,
}: GroupConversationViewProps) {
  const [searchText, setSearchText] = useState("");

  // Generate more conversations with varied dates
  const expandedConversations = useMemo(() => {
    if (conversations.length === 0) return [];

    // Determine if this space should have no history (25% probability)
    const hash = space.id
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const shouldHaveNoHistory = hash % 4 === 0;

    if (shouldHaveNoHistory) return [];

    // Generate at least 20 conversations, more if we have fewer originals
    const targetCount = Math.max(20, conversations.length * 4);
    return generateConversationsWithDates(conversations, targetCount);
  }, [conversations, space.id]);

  // Filter conversations by search text
  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) {
      return expandedConversations;
    }
    const searchLower = searchText.toLowerCase();
    return expandedConversations.filter(
      (conv) =>
        conv.title.toLowerCase().includes(searchLower) ||
        conv.description?.toLowerCase().includes(searchLower)
    );
  }, [expandedConversations, searchText]);

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

    filteredConversations.forEach((conversation) => {
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
  }, [filteredConversations]);

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

  const hasHistory = expandedConversations.length > 0;

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background">
      {/* Tabs */}
      <Tabs
        defaultValue="conversations"
        className="s-flex s-min-h-0 s-flex-1 s-flex-col s-pt-3"
      >
        <TabsList className="s-px-6">
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
          {showToolsAndAboutTabs && (
            <>
              <TabsTrigger value="Tools" label="Tools" icon={ToolsIcon} />
              <TabsTrigger
                value="about"
                label="About"
                icon={InformationCircleIcon}
              />
            </>
          )}
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
            <div
              className={`s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 ${
                !hasHistory ? "s-h-full s-justify-center s-py-8" : "s-py-8"
              }`}
            >
              {/* New conversation section */}
              <div className="s-flex s-flex-col s-gap-3">
                <h2 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
                  {space.name}
                </h2>
                <InputBar
                  placeholder={`Start a conversation in ${space.name}`}
                />
              </div>

              {/* Conversations list */}
              <div className="s-flex s-flex-col s-gap-3">
                {expandedConversations.length > 0 && (
                  <>
                    <SearchInput
                      name="conversation-search"
                      value={searchText}
                      onChange={setSearchText}
                      placeholder={`Search in ${space.name}`}
                      className="s-w-full"
                    />
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

                                // Generate random message count (1-3)
                                const messageCount = Math.floor(
                                  Math.random() * 3 + 1
                                );

                                // Generate random reply count (1-8)
                                const replyCount = Math.floor(
                                  Math.random() * 8 + 1
                                );

                                // Extract base conversation ID if this is an expanded conversation
                                // Expanded IDs have pattern: {baseId}-{number} (e.g., "conv-1-5")
                                // Check if ID matches expanded pattern (ends with -{digits})
                                // Use a more specific pattern to avoid false matches with IDs like "conv-10"
                                const expandedIdMatch =
                                  conversation.id.match(/^(.+)-(\d+)$/);
                                // Only extract if the match makes sense (base ID exists in original conversations)
                                let baseConversationId = conversation.id;
                                if (expandedIdMatch) {
                                  const potentialBase = expandedIdMatch[1];
                                  // Check if the base ID exists in the original conversations
                                  const baseExists = conversations.some(
                                    (c) => c.id === potentialBase
                                  );
                                  if (baseExists) {
                                    baseConversationId = potentialBase;
                                  }
                                }

                                // Create a conversation object with the base ID for lookup
                                const conversationForLookup = {
                                  ...conversation,
                                  id: baseConversationId,
                                };

                                return (
                                  <ConversationListItem
                                    key={conversation.id}
                                    conversation={conversation}
                                    creator={creator || undefined}
                                    time={time}
                                    replySection={
                                      <ReplySection
                                        totalMessages={replyCount}
                                        newMessages={
                                          bucketKey === "Today"
                                            ? messageCount
                                            : 0
                                        }
                                        avatars={avatarProps}
                                        lastMessageBy={
                                          avatarProps[0]?.name || "Unknown"
                                        }
                                      />
                                    }
                                    onClick={() => {
                                      onConversationClick?.(
                                        conversationForLookup
                                      );
                                    }}
                                  />
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
        {showToolsAndAboutTabs && (
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
        )}
      </Tabs>
    </div>
  );
}
