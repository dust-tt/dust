import {
  Avatar,
  ConversationListItem,
  ListGroup,
  ListItemSection,
  ReplySection,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import type { Agent, Conversation, User } from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";

interface PersonAgentViewProps {
  collaborator: { type: "agent" | "person"; data: Agent | User };
  user: User;
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  aboutOpen?: boolean;
  onAboutOpenChange?: (open: boolean) => void;
  onConversationClick?: (conversation: Conversation) => void;
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

// Helper function to get creator from conversation
function getCreator(conversation: Conversation, _users: User[]): User | null {
  if (conversation.userParticipants.length === 0) {
    return null;
  }
  const creatorId = conversation.userParticipants[0];
  return getUserById(creatorId) || null;
}

// Helper function to generate more conversations with varied dates
function generateConversationsWithDates(
  conversations: Conversation[],
  count: number
): Conversation[] {
  const now = new Date();
  const generated: Conversation[] = [];

  // Shuffle conversations array to randomize selection
  const shuffled = [...conversations].sort(() => Math.random() - 0.5);

  // Randomly pick conversations instead of cycling through them
  for (let i = 0; i < count; i++) {
    // Randomly select from shuffled array
    const randomIndex = Math.floor(Math.random() * shuffled.length);
    const baseConversation = shuffled[randomIndex];

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

export function PersonAgentView({
  collaborator,
  user,
  conversations,
  aboutOpen = false,
  onAboutOpenChange,
  onConversationClick,
}: PersonAgentViewProps) {
  const [searchText, setSearchText] = useState("");

  // Get collaborator name for placeholder
  const collaboratorName =
    collaborator.type === "agent"
      ? (collaborator.data as Agent).name
      : (collaborator.data as User).fullName;

  // Generate more conversations with varied dates
  const expandedConversations = useMemo(() => {
    if (conversations.length === 0) return [];

    // Determine if this collaborator should have no history (25% probability)
    const collaboratorId =
      collaborator.type === "agent"
        ? (collaborator.data as Agent).id
        : (collaborator.data as User).id;
    const hash = collaboratorId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const shouldHaveNoHistory = hash % 4 === 0;

    if (shouldHaveNoHistory) return [];

    // Generate at least 20 conversations, more if we have fewer originals
    const targetCount = Math.max(20, conversations.length * 4);
    return generateConversationsWithDates(conversations, targetCount);
  }, [conversations, collaborator]);

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

  // Get collaborator avatar props
  const collaboratorAvatar = useMemo(() => {
    if (collaborator.type === "agent") {
      const agent = collaborator.data as Agent;
      return {
        name: agent.name,
        emoji: agent.emoji,
        backgroundColor: agent.backgroundColor,
        isRounded: false,
      };
    } else {
      const person = collaborator.data as User;
      return {
        name: person.fullName,
        visual: person.portrait,
        isRounded: true,
      };
    }
  }, [collaborator]);

  // Get user avatar props
  const userAvatar = useMemo(() => {
    return {
      name: user.fullName,
      visual: user.portrait,
      isRounded: true,
    };
  }, [user]);

  const hasHistory = expandedConversations.length > 0;

  return (
    <div className="flex h-full w-full flex-col bg-background px-6">
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={`mx-auto flex w-full max-w-4xl flex-col gap-6 ${
            !hasHistory ? "h-full justify-center py-8" : "py-8"
          }`}
        >
          <InputBar
            placeholder={`Start a conversation with ${collaboratorName}`}
          />

          {/* Conversations list */}
          <div className="flex flex-col gap-3">
            {hasHistory && (
              <>
                <div className="flex w-full px-3">
                  <SearchInput
                    name="conversation-search"
                    value={searchText}
                    onChange={setSearchText}
                    placeholder={`Search in conversations with ${collaboratorName}`}
                    className="w-full"
                  />
                </div>
                <div className="flex flex-col">
                  {(
                    ["Today", "Yesterday", "Last Week", "Last Month"] as const
                  ).map((bucketKey) => {
                    const bucketConversations =
                      conversationsByBucket[bucketKey];
                    if (bucketConversations.length === 0) return null;

                    return (
                      <div key={bucketKey}>
                        <ListItemSection>{bucketKey}</ListItemSection>
                        <ListGroup>
                          {bucketConversations.map((conversation) => {
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

                            // Randomly determine if conversation was created by user or collaborator
                            // Use conversation ID as seed for consistent randomness per conversation
                            const seed = conversation.id
                              .split("")
                              .reduce(
                                (acc, char) => acc + char.charCodeAt(0),
                                0
                              );
                            const isCreatedByUser = seed % 2 === 0;

                            return (
                              <ConversationListItem
                                key={conversation.id}
                                conversation={conversation}
                                creator={
                                  isCreatedByUser
                                    ? {
                                        fullName: user.fullName,
                                        portrait: user.portrait,
                                      }
                                    : collaborator.type === "agent"
                                      ? {
                                          fullName: (collaborator.data as Agent)
                                            .name,
                                        }
                                      : {
                                          fullName: (collaborator.data as User)
                                            .fullName,
                                          portrait: (collaborator.data as User)
                                            .portrait,
                                        }
                                }
                                avatar={
                                  isCreatedByUser
                                    ? userAvatar
                                    : collaboratorAvatar
                                }
                                time={time}
                                replySection={
                                  <ReplySection
                                    replyCount={replyCount}
                                    unreadCount={
                                      bucketKey === "Today" ? messageCount : 0
                                    }
                                    avatars={[
                                      isCreatedByUser
                                        ? collaboratorAvatar
                                        : userAvatar,
                                    ]}
                                    lastMessageBy={
                                      (isCreatedByUser
                                        ? collaboratorAvatar
                                        : userAvatar
                                      )?.name || "Unknown"
                                    }
                                  />
                                }
                                onClick={() => {
                                  onConversationClick?.(conversation);
                                }}
                              />
                            );
                          })}
                        </ListGroup>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <Sheet open={aboutOpen} onOpenChange={onAboutOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>About {collaboratorName}</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="text-foreground">DetailView</div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
