import {
  Avatar,
  BookOpenIcon,
  Button,
  ChatBubbleLeftRightIcon,
  ConversationListItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Input,
  ListGroup,
  ListItem,
  ListItemSection,
  PlusIcon,
  ReplySection,
  SearchInput,
  SliderToggle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToolsIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  Separator,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { getAgentById } from "../data/agents";
import type { Agent, Conversation, Space, User } from "../data/types";
import { getUserById } from "../data/users";
import { ConversationSuggestion } from "./ConversationSuggestion";
import { InputBar } from "./InputBar";

interface GroupConversationViewProps {
  space: Space;
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  spaceMemberIds?: string[];
  onConversationClick?: (conversation: Conversation) => void;
  onInviteMembers?: () => void;
  showToolsAndAboutTabs?: boolean;
  onUpdateSpaceName?: (spaceId: string, newName: string) => void;
  onUpdateSpacePublic?: (spaceId: string, isPublic: boolean) => void;
  spacePublicSettings?: Map<string, boolean>;
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

// Seeded random function for deterministic randomness
function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function GroupConversationView({
  space,
  conversations,
  users,
  agents,
  spaceMemberIds = [],
  onConversationClick,
  onInviteMembers,
  showToolsAndAboutTabs = false,
  onUpdateSpaceName,
  onUpdateSpacePublic,
  spacePublicSettings,
}: GroupConversationViewProps) {
  const [searchText, setSearchText] = useState("");

  // Settings state
  const [roomName, setRoomName] = useState(space.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPublic, setIsPublic] = useState(
    spacePublicSettings?.get(space.id) ?? space.isPublic ?? true
  );
  const [showNameSaveDialog, setShowNameSaveDialog] = useState(false);
  const [showPublicToggleDialog, setShowPublicToggleDialog] = useState(false);
  const [pendingPublicValue, setPendingPublicValue] = useState<boolean | null>(
    null
  );

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

  // Determine if space is new (no conversations and no members)
  const isNew = useMemo(() => {
    return (
      conversations.length === 0 &&
      (!spaceMemberIds || spaceMemberIds.length === 0)
    );
  }, [conversations.length, spaceMemberIds]);

  // Get avatar count (3-15) based on space ID for deterministic randomness
  const avatarCount = useMemo(() => {
    const hash = space.id
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return 3 + (hash % 13); // 3 to 15
  }, [space.id]);

  // Get avatars for this space - deterministic per space, or from invited members
  const spaceAvatars = useMemo(() => {
    // New spaces show no avatars
    if (isNew) return [];

    // If space has invited members, use those
    if (spaceMemberIds.length > 0) {
      const memberAvatars: Array<{
        name: string;
        visual?: string;
        isRounded: boolean;
      }> = [];
      spaceMemberIds.forEach((id) => {
        const user = users.find((u) => u.id === id);
        if (user) {
          memberAvatars.push({
            name: user.fullName,
            visual: user.portrait,
            isRounded: true,
          });
        }
      });
      return memberAvatars;
    }

    // Generate deterministic random avatars based on space.id
    const shuffled = [...users].sort((a, b) => {
      const aHash = space.id + a.id;
      const bHash = space.id + b.id;
      return seededRandom(aHash, 0) - seededRandom(bHash, 0);
    });
    return shuffled.slice(0, avatarCount).map((user) => ({
      name: user.fullName,
      visual: user.portrait,
      isRounded: true,
    }));
  }, [space.id, isNew, spaceMemberIds, users, avatarCount]);

  const hasHistory = expandedConversations.length > 0;

  // Handle room name save confirmation
  const handleNameSaveConfirm = () => {
    onUpdateSpaceName?.(space.id, roomName);
    setIsEditingName(false);
    setShowNameSaveDialog(false);
  };

  // Handle public toggle confirmation
  const handlePublicToggleConfirm = () => {
    if (pendingPublicValue !== null) {
      setIsPublic(pendingPublicValue);
      onUpdateSpacePublic?.(space.id, pendingPublicValue);
      setPendingPublicValue(null);
    }
    setShowPublicToggleDialog(false);
  };

  // Reset room name when space changes
  useEffect(() => {
    setRoomName(space.name);
    setIsEditingName(false);
    setIsPublic(spacePublicSettings?.get(space.id) ?? space.isPublic ?? true);
  }, [space.id, space.name, spacePublicSettings, space.isPublic]);

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
          <TabsTrigger
            value="settings"
            icon={Cog6ToothIcon}
            tooltip={"Room settings"}
          />
          <div className="s-flex-1" />
          {spaceAvatars.length > 0 && (
            <div className="s-flex s-h-8 s-items-center">
              <Avatar.Stack
                avatars={spaceAvatars}
                nbVisibleItems={spaceAvatars.length}
                orientation="horizontal"
                hasMagnifier={false}
                size="xs"
              />
            </div>
          )}
        </TabsList>

        {/* Conversations Tab */}
        <TabsContent value="conversations">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
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

              {/* Suggestions for empty rooms */}
              {!hasHistory && (
                <ConversationSuggestion
                  suggestions={[
                    {
                      id: "add-knowledge",
                      label: "Add knowledge",
                      icon: BookOpenIcon,
                      description:
                        "Centralize the information used in this project for Agents and Participants.",
                      onClick: () => {
                        console.log("Add knowledge clicked");
                      },
                    },
                    {
                      id: "invite-members",
                      label: "Invite members",
                      icon: UserGroupIcon,
                      description:
                        "Invite team members to collaborate and participate in this room.",
                      onClick: () => {
                        onInviteMembers?.();
                      },
                    },
                  ]}
                />
              )}

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
              <h2 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
                About {space.name}
              </h2>
              <p className="s-text-foreground dark:s-text-foreground-night">
                {space.description}
              </p>
            </div>
          </TabsContent>
        )}

        {/* Settings Tab */}
        <TabsContent
          value="settings"
          className="s-flex s-flex-1 s-flex-col s-overflow-y-auto s-px-6 s-py-6"
        >
          <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-8 s-py-8">
            {/* Room Name Section */}
            <h3 className="s-heading-2xl">Settings</h3>
            <div className="s-flex s-w-full s-flex-col s-gap-2">
              <h3 className="s-heading-lg">Name</h3>
              <div className="s-flex s-w-full s-min-w-0 s-gap-2">
                <Input
                  value={roomName}
                  onChange={(e) => {
                    setRoomName(e.target.value);
                    setIsEditingName(e.target.value !== space.name);
                  }}
                  placeholder="Enter room name"
                  containerClassName="s-flex-1"
                />
                {isEditingName && (
                  <>
                    <Button
                      label="Save"
                      variant="highlight"
                      onClick={() => setShowNameSaveDialog(true)}
                    />
                    <Button
                      label="Cancel"
                      variant="outline"
                      onClick={() => {
                        setRoomName(space.name);
                        setIsEditingName(false);
                      }}
                    />
                  </>
                )}
              </div>
            </div>
            {/* Open to Everyone Section */}

            <div className="s-flex s-w-full s-flex-col s-gap-2">
              <h3 className="s-heading-lg">Visibility</h3>
              <div className="s-flex s-items-start s-justify-between s-gap-4">
                <div className="s-flex s-flex-col">
                  <div className="s-heading-sm s-text-foreground">
                    Opened to everyone
                  </div>
                  <div className="s-text-sm s-text-muted-foreground">
                    Anyone in the workspace can find and join the room.
                  </div>
                </div>
                <SliderToggle
                  size="xs"
                  selected={isPublic}
                  onClick={() => {
                    const nextValue = !isPublic;
                    setShowPublicToggleDialog(true);
                    // Store the intended new value temporarily
                    setPendingPublicValue(nextValue);
                  }}
                />
              </div>
            </div>
            {/* Members Section */}
            <div className="s-flex s-flex-col s-gap-3">
              <div className="s-flex s-items-center s-gap-2">
                <h3 className="s-heading-lg s-flex-1">Members</h3>
                <Button
                  label="Invite more"
                  variant="outline"
                  icon={UserGroupIcon}
                  onClick={() => onInviteMembers?.()}
                />
              </div>
              <ListGroup>
                {spaceMemberIds.map((memberId) => {
                  const user = users.find((u) => u.id === memberId);
                  if (!user) return null;
                  return (
                    <ListItem key={memberId} itemsAlignment="center">
                      <Avatar
                        name={user.fullName}
                        visual={user.portrait}
                        size="sm"
                        isRounded={true}
                      />
                      <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
                        <span className="s-text-sm s-font-medium s-text-foreground">
                          {user.fullName}
                        </span>
                        <span className="s-text-xs s-text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </ListItem>
                  );
                })}
              </ListGroup>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialogs */}
      {/* Name Save Dialog */}
      <Dialog
        open={showNameSaveDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowNameSaveDialog(false);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Change name to "{roomName}"?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            This updates the name for everyone and may impact Agents set to post
            here.
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setShowNameSaveDialog(false),
            }}
            rightButtonProps={{
              label: "Rename",
              variant: "warning",
              onClick: handleNameSaveConfirm,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Public Toggle Dialog */}
      <Dialog
        open={showPublicToggleDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowPublicToggleDialog(false);
            setPendingPublicValue(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {pendingPublicValue === true
                ? "Switch to public?"
                : "Switch to restricted?"}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {pendingPublicValue === true
              ? "Everyone in the workspace will be able to see and join this room."
              : "Access will be limited to invited members only."}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setShowPublicToggleDialog(false);
                setPendingPublicValue(null);
              },
            }}
            rightButtonProps={{
              label: "Confirm",
              variant: "warning",
              onClick: handlePublicToggleConfirm,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
