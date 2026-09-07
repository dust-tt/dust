import {
  Avatar,
  Button,
  Check,
  Collapsible,
  CollapsibleContent,
  ConversationListItem,
  Cube01,
  CubeOutline,
  Icon,
  Inbox01,
  ListGroup,
  MessageChatSquare,
  ReplySection,
  SearchInput,
  SearchInputWithPopover,
  UniversalSearchItem,
  Zap,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import { getAgentById } from "../data/agents";
import { getRandomInboxGreetingForName } from "../data/greetings";
import { isTriggeredConversation } from "../data/myPod";
import type { Agent, Conversation, Space, User } from "../data/types";
import { getUserById } from "../data/users";
import { EmptyState } from "./EmptyState";
import { TaskItem } from "./TaskItem";

type InboxTab = "conversations" | "tasks";

type InboxConversationSearchItem = {
  type: "conversation";
  conversation: Conversation;
  creator?: User;
  title: string;
  description: string;
  score: number;
};

interface InboxTask {
  id: string;
  text: string;
}

interface InboxViewProps {
  spaces: Space[];
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  activeTab?: InboxTab;
  selectedConversationId?: string | null;
  currentUserId?: string;
  onConversationClick?: (conversation: Conversation) => void;
  onMyPodClick?: () => void;
  onAutomationsClick?: () => void;
  onSpaceClick?: (space: Space) => void;
  personalSectionLabel?: string;
}

const INBOX_TASK_ITEMS: InboxTask[] = [
  {
    id: "fake-todo-design-copy",
    text: "Tighten the onboarding copy for a sharper first-run flow.",
  },
  {
    id: "fake-todo-risk-log",
    text: "Add the latest mitigation notes to the weekly risk log.",
  },
  {
    id: "fake-todo-customer-brief",
    text: "Prepare the customer brief for the roadmap sync.",
  },
  {
    id: "fake-todo-data-check",
    text: "Validate the dashboard numbers against the source export.",
  },
  {
    id: "fake-todo-launch-owner",
    text: "Document who owns each beta rollout checklist item.",
  },
  {
    id: "fake-todo-budget-follow-up",
    text: "Resolve the budget question before planning closes.",
  },
  {
    id: "fake-todo-doc-update",
    text: "Update the implementation notes with the latest constraints.",
  },
  {
    id: "fake-todo-support-plan",
    text: "Draft the first-week support plan.",
  },
  {
    id: "fake-todo-qa-scope",
    text: "Split the QA scope into smoke tests and regression checks.",
  },
  {
    id: "fake-todo-api-contract",
    text: "Write down the API contract changes for the integrations team.",
  },
];

function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildInboxConversationSearchResults(
  conversations: Conversation[],
  searchText: string,
  users: User[]
): InboxConversationSearchItem[] {
  const trimmed = searchText.trim();
  if (!trimmed) {
    return [];
  }

  const searchLower = trimmed.toLowerCase();

  return conversations
    .reduce<InboxConversationSearchItem[]>((acc, conversation) => {
      const creator = getRandomCreator(conversation, users);
      const title = conversation.title;
      const description = conversation.description ?? "";
      const searchableTitle = creator ? `${creator.fullName} ${title}` : title;
      const titleMatch = searchableTitle.toLowerCase().includes(searchLower);
      const descriptionMatch = description.toLowerCase().includes(searchLower);

      if (titleMatch || descriptionMatch) {
        acc.push({
          type: "conversation",
          conversation,
          creator: creator || undefined,
          title,
          description,
          score: titleMatch ? 2 : 1,
        });
      }

      return acc;
    }, [])
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });
}

function getTasksForPod(podKey: string): InboxTask[] {
  const count =
    Math.floor(seededRandom(podKey, 0) * 3) + (podKey === "my-pod" ? 2 : 1);

  return [...INBOX_TASK_ITEMS]
    .sort(
      (a, b) =>
        seededRandom(`${podKey}-${a.id}`, 0) -
        seededRandom(`${podKey}-${b.id}`, 0)
    )
    .slice(0, Math.min(count, INBOX_TASK_ITEMS.length))
    .map((task) => ({
      ...task,
      id: `${podKey}-${task.id}`,
    }));
}

function getRandomParticipants(
  conversation: Conversation,
  _users: User[],
  _agents: Agent[]
): Array<{ type: "user" | "agent"; data: User | Agent }> {
  const allParticipants: Array<{ type: "user" | "agent"; data: User | Agent }> =
    [];

  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      allParticipants.push({ type: "user", data: user });
    }
  });

  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      allParticipants.push({ type: "agent", data: agent });
    }
  });

  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const count = Math.min(
    Math.max(1, Math.floor(Math.random() * 6) + 1),
    shuffled.length
  );
  return shuffled.slice(0, count);
}

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
    }

    const agent = participant.data as Agent;
    return {
      name: agent.name,
      emoji: agent.emoji,
      backgroundColor: agent.backgroundColor,
      isRounded: false,
    };
  });
}

function getConversationListItemMeta(conversation: Conversation) {
  const time = conversation.updatedAt
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace("24:", "00:");

  const replyCount = Math.floor(Math.random() * 8 + 1);
  const messageCount = Math.floor(Math.random() * replyCount + 1);
  const mentionCount = Math.floor(Math.random() * (messageCount + 1));

  return { time, replyCount, messageCount, mentionCount };
}

function getInboxPodSectionIcon(space: Space) {
  const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
  return isRestricted ? CubeOutline : Cube01;
}

export function InboxView({
  spaces,
  conversations,
  users,
  agents,
  activeTab = "conversations",
  selectedConversationId = null,
  currentUserId,
  onConversationClick,
  onMyPodClick,
  onAutomationsClick,
  onSpaceClick,
  personalSectionLabel = "My Pod",
}: InboxViewProps) {
  const currentUserFirstName = currentUserId
    ? (getUserById(currentUserId)?.firstName ?? "there")
    : "there";
  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomInboxGreetingForName(currentUserFirstName));
  }, [currentUserFirstName]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
  );
  const [collapsedTaskSections, setCollapsedTaskSections] = useState<
    Set<string>
  >(new Set());
  const [checkedTaskKeys, setCheckedTaskKeys] = useState<Set<string>>(
    new Set()
  );
  const [conversationSearchText, setConversationSearchText] = useState("");
  const [isConversationSearchOpen, setIsConversationSearchOpen] =
    useState(false);
  const [taskSearchText, setTaskSearchText] = useState("");

  const toggleSectionCollapse = (sectionKey: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const toggleTaskSectionCollapse = (sectionKey: string) => {
    setCollapsedTaskSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const myConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const filtered = conversations.filter((conv) => {
      if (isTriggeredConversation(conv)) {
        return false;
      }
      if (conv.spaceId) return false;
      return conv.updatedAt >= twoDaysAgo;
    });

    const sorted = [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const limit = Math.min(
      Math.max(1, Math.floor(Math.random() * 3) + 1),
      sorted.length
    );
    return sorted.slice(0, limit);
  }, [conversations]);

  const automationConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const filtered = conversations.filter((conv) => {
      if (!isTriggeredConversation(conv)) {
        return false;
      }
      return conv.updatedAt >= twoDaysAgo;
    });

    const sorted = [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const limit = Math.min(
      Math.max(1, Math.floor(Math.random() * 3) + 1),
      sorted.length
    );
    return sorted.slice(0, limit);
  }, [conversations]);

  const unreadConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return conversations.filter((conv) => {
      if (isTriggeredConversation(conv)) {
        return false;
      }
      if (!conv.spaceId) return false;
      return conv.updatedAt >= twoDaysAgo;
    });
  }, [conversations]);

  const inboxSearchableConversations = useMemo(
    () => [
      ...myConversations,
      ...automationConversations,
      ...unreadConversations,
    ],
    [automationConversations, myConversations, unreadConversations]
  );

  const conversationSearchResults = useMemo(
    () =>
      buildInboxConversationSearchResults(
        inboxSearchableConversations,
        conversationSearchText,
        users
      ),
    [conversationSearchText, inboxSearchableConversations, users]
  );

  const conversationsBySpace = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();

    unreadConversations.forEach((conv) => {
      if (conv.spaceId) {
        const existing = grouped.get(conv.spaceId) || [];
        existing.push(conv);
        grouped.set(conv.spaceId, existing);
      }
    });

    const result = new Map<string, Conversation[]>();
    grouped.forEach((convs, spaceId) => {
      const sorted = [...convs].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      const limit = Math.min(
        Math.max(1, Math.floor(Math.random() * 4) + 1),
        sorted.length
      );
      result.set(spaceId, sorted.slice(0, limit));
    });

    return result;
  }, [unreadConversations]);

  const spacesWithUnread = useMemo(() => {
    return spaces.filter((space) => conversationsBySpace.has(space.id));
  }, [spaces, conversationsBySpace]);

  // Stabilize the random per-conversation display data (participants, creator,
  // reply/message/mention counts) so unrelated re-renders don't reshuffle the
  // lists. Recomputed only when the displayed conversations change.
  const conversationDisplayById = useMemo(() => {
    const map = new Map<
      string,
      {
        creator?: User;
        avatarProps: ReturnType<typeof participantsToAvatarProps>;
        time: string;
        replyCount: number;
        messageCount: number;
        mentionCount: number;
      }
    >();

    const displayed = [
      ...myConversations,
      ...automationConversations,
      ...Array.from(conversationsBySpace.values()).flat(),
    ];

    displayed.forEach((conversation) => {
      if (map.has(conversation.id)) {
        return;
      }
      const participants = getRandomParticipants(conversation, users, agents);
      const creator = getRandomCreator(conversation, users);
      const meta = getConversationListItemMeta(conversation);
      map.set(conversation.id, {
        creator: creator || undefined,
        avatarProps: participantsToAvatarProps(participants),
        ...meta,
      });
    });

    return map;
  }, [
    automationConversations,
    myConversations,
    conversationsBySpace,
    users,
    agents,
  ]);

  const hasConversationContent =
    myConversations.length > 0 ||
    automationConversations.length > 0 ||
    spacesWithUnread.length > 0;

  const baseInboxTaskGroups = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      onHeaderClick?: () => void;
      tasks: InboxTask[];
    }> = [];

    const myPodTasks = getTasksForPod("my-pod").filter(
      (task) => !checkedTaskKeys.has(task.id)
    );
    if (myPodTasks.length > 0) {
      groups.push({
        key: "my-pod",
        label: personalSectionLabel,
        onHeaderClick: onMyPodClick,
        tasks: myPodTasks,
      });
    }

    spaces.forEach((space) => {
      const tasks = getTasksForPod(space.id).filter(
        (task) => !checkedTaskKeys.has(task.id)
      );
      if (tasks.length > 0) {
        groups.push({
          key: space.id,
          label: space.name,
          onHeaderClick: () => onSpaceClick?.(space),
          tasks,
        });
      }
    });

    return groups;
  }, [
    checkedTaskKeys,
    onMyPodClick,
    onSpaceClick,
    personalSectionLabel,
    spaces,
  ]);

  const inboxTaskGroups = useMemo(() => {
    const normalizedSearch = taskSearchText.trim().toLowerCase();

    return baseInboxTaskGroups
      .map((group) => ({
        ...group,
        tasks:
          normalizedSearch.length === 0
            ? group.tasks
            : group.tasks.filter((task) =>
                task.text.toLowerCase().includes(normalizedSearch)
              ),
      }))
      .filter((group) => group.tasks.length > 0);
  }, [baseInboxTaskGroups, taskSearchText]);

  const hasTaskContent = baseInboxTaskGroups.length > 0;
  const hasFilteredTaskContent = inboxTaskGroups.length > 0;

  const allConversationSectionsCollapsed = useMemo(() => {
    if (!hasConversationContent) return true;

    const myConversationsCollapsed =
      myConversations.length === 0 || collapsedSections.has("my-conversations");

    const automationsCollapsed =
      automationConversations.length === 0 ||
      collapsedSections.has("automations");

    const allSpacesCollapsed =
      spacesWithUnread.length === 0 ||
      spacesWithUnread.every((space) => collapsedSections.has(space.id));

    return (
      myConversationsCollapsed && automationsCollapsed && allSpacesCollapsed
    );
  }, [
    automationConversations.length,
    collapsedSections,
    hasConversationContent,
    myConversations.length,
    spacesWithUnread,
  ]);

  const allTaskSectionsCollapsed = useMemo(() => {
    if (!hasFilteredTaskContent) return true;

    return inboxTaskGroups.every((group) =>
      collapsedTaskSections.has(group.key)
    );
  }, [collapsedTaskSections, hasFilteredTaskContent, inboxTaskGroups]);

  const handleConversationSearchSelect = (
    item: InboxConversationSearchItem
  ) => {
    onConversationClick?.(item.conversation);
    setIsConversationSearchOpen(false);
  };

  const renderConversationSearchItem = (
    item: InboxConversationSearchItem,
    selected: boolean
  ) => {
    const description = item.description || "No description available.";
    const visual = item.creator ? (
      <Avatar
        name={item.creator.fullName}
        visual={item.creator.portrait}
        size="xs"
        isRounded={true}
      />
    ) : null;
    const title = item.creator ? (
      <>
        <span className="shrink-0">{item.creator.fullName}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {item.title}
        </span>
      </>
    ) : (
      <span className="min-w-0 truncate">{item.title}</span>
    );

    return (
      <UniversalSearchItem
        key={item.conversation.id}
        onClick={() => handleConversationSearchSelect(item)}
        selected={selected}
        hasSeparator={false}
        visual={visual}
        title={title}
        description={description}
      />
    );
  };

  const handleMarkAllConversationsAsRead = () => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.add("my-conversations");
      next.add("automations");
      spacesWithUnread.forEach((space) => next.add(space.id));
      return next;
    });
  };

  const renderConversationsToolbar = () => (
    <div className="flex items-center gap-2">
      <SearchInputWithPopover
        name="inbox-conversation-search"
        value={conversationSearchText}
        onChange={(value) => {
          setConversationSearchText(value);
          if (!value.trim()) {
            setIsConversationSearchOpen(false);
          }
        }}
        open={isConversationSearchOpen}
        onOpenChange={setIsConversationSearchOpen}
        placeholder="Search in Inbox"
        className="w-full"
        items={conversationSearchResults}
        availableHeight
        noResults={
          conversationSearchText.trim()
            ? "No results found"
            : "Start typing to search"
        }
        onItemSelect={handleConversationSearchSelect}
        renderItem={(item, selected) =>
          renderConversationSearchItem(item, selected)
        }
      />
      <Button
        label="Mark all as read"
        icon={Check}
        size="sm"
        variant="outline"
        tooltip="Mark all as read"
        onClick={handleMarkAllConversationsAsRead}
      />
    </div>
  );

  const renderTasksToolbar = () => (
    <SearchInput
      name="inbox-task-search"
      value={taskSearchText}
      onChange={setTaskSearchText}
      placeholder="Search tasks..."
      className="w-full"
    />
  );

  const renderInboxSectionHeader = (
    label: string,
    onHeaderClick: (() => void) | undefined,
    onAction: () => void,
    actionLabel: string,
    icon?: ComponentType<{ className?: string }>
  ) => (
    <div
      className="mt-2 flex cursor-pointer items-center justify-between rounded-2xl bg-muted-background p-1.5 pl-3.5 heading-sm"
      onClick={onHeaderClick}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {icon ? <Icon visual={icon} size="sm" /> : null}
        {label}
      </span>
      <Button
        label={actionLabel}
        icon={Check}
        size="sm"
        variant="ghost-secondary"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAction();
        }}
      />
    </div>
  );

  const renderInboxConversationItem = (conversation: Conversation) => {
    const display = conversationDisplayById.get(conversation.id);
    const creator = display?.creator;
    const avatarProps = display?.avatarProps ?? [];
    const time = display?.time ?? "";
    const replyCount = display?.replyCount ?? 0;
    const messageCount = display?.messageCount ?? 0;
    const mentionCount = display?.mentionCount ?? 0;
    const isSelected = selectedConversationId === conversation.id;

    return (
      <ConversationListItem
        key={conversation.id}
        conversation={conversation}
        creator={creator || undefined}
        className={cn(
          "px-3 rounded-2xl border-transparent!",
          isSelected && "bg-highlight-50"
        )}
        time={time}
        replySection={
          <ReplySection
            replyCount={replyCount}
            unreadCount={messageCount}
            mentionCount={mentionCount}
            avatars={avatarProps}
            lastMessageBy={avatarProps[0]?.name || "Unknown"}
          />
        }
        onClick={() => {
          onConversationClick?.(conversation);
        }}
      />
    );
  };

  const renderEmptyState = (title: string, description: React.ReactNode) => (
    <EmptyState icon={Inbox01} title={title} description={description} />
  );

  const renderConversationsTab = () => {
    if (!hasConversationContent) {
      return renderEmptyState(
        "Inbox",
        <>
          You're all caught up!
          <br />
          Nothing new under the sun.
        </>
      );
    }

    if (allConversationSectionsCollapsed) {
      return (
        <div className="flex flex-1 flex-col gap-3">
          {renderConversationsToolbar()}
          {renderEmptyState(
            "Inbox",
            <>
              You're all caught up!
              <br />
              Nothing new under the sun.
            </>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {renderConversationsToolbar()}
        <div className="flex flex-col">
          {myConversations.length > 0 && (
            <Collapsible
              key="my-conversations"
              open={!collapsedSections.has("my-conversations")}
              onOpenChange={(open) => {
                if (!open) {
                  setCollapsedSections((prev) =>
                    new Set(prev).add("my-conversations")
                  );
                } else {
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.delete("my-conversations");
                    return next;
                  });
                }
              }}
              className="flex flex-col"
            >
              <CollapsibleContent>
                <div className="flex flex-col gap-1">
                  {renderInboxSectionHeader(
                    personalSectionLabel,
                    onMyPodClick,
                    () => toggleSectionCollapse("my-conversations"),
                    "Mark as read",
                    MessageChatSquare
                  )}
                  <ListGroup className="border-transparent! gap-0.5">
                    {myConversations.map(renderInboxConversationItem)}
                  </ListGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {automationConversations.length > 0 && (
            <Collapsible
              key="automations"
              open={!collapsedSections.has("automations")}
              onOpenChange={(open) => {
                if (!open) {
                  setCollapsedSections((prev) =>
                    new Set(prev).add("automations")
                  );
                } else {
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.delete("automations");
                    return next;
                  });
                }
              }}
              className="flex flex-col"
            >
              <CollapsibleContent>
                <div className="flex flex-col gap-1">
                  {renderInboxSectionHeader(
                    "Automations",
                    onAutomationsClick,
                    () => toggleSectionCollapse("automations"),
                    "Mark as read",
                    Zap
                  )}
                  <ListGroup className="border-transparent! gap-0.5">
                    {automationConversations.map(renderInboxConversationItem)}
                  </ListGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {spacesWithUnread.map((space) => {
            const spaceConversations = conversationsBySpace.get(space.id) || [];
            if (spaceConversations.length === 0) return null;

            return (
              <Collapsible
                key={space.id}
                open={!collapsedSections.has(space.id)}
                onOpenChange={(open) => {
                  if (!open) {
                    setCollapsedSections((prev) => new Set(prev).add(space.id));
                  } else {
                    setCollapsedSections((prev) => {
                      const next = new Set(prev);
                      next.delete(space.id);
                      return next;
                    });
                  }
                }}
                className="flex flex-col"
              >
                <CollapsibleContent>
                  <div className="flex flex-col gap-1">
                    {renderInboxSectionHeader(
                      space.name,
                      () => onSpaceClick?.(space),
                      () => toggleSectionCollapse(space.id),
                      "Mark as read",
                      getInboxPodSectionIcon(space)
                    )}
                    <ListGroup className="border-transparent! gap-0.5">
                      {spaceConversations.map(renderInboxConversationItem)}
                    </ListGroup>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTasksTab = () => {
    if (!hasTaskContent) {
      return renderEmptyState(
        "All tasks done",
        "No ongoing tasks across your pods."
      );
    }

    if (!hasFilteredTaskContent) {
      return (
        <div className="flex flex-1 flex-col gap-3">
          {renderTasksToolbar()}
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <p className="text-center text-lg text-muted-foreground">
              No tasks match your search.
            </p>
          </div>
        </div>
      );
    }

    if (allTaskSectionsCollapsed) {
      return (
        <div className="flex flex-1 flex-col gap-3">
          {renderTasksToolbar()}
          {renderEmptyState(
            "All tasks done",
            "No ongoing tasks across your pods."
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {renderTasksToolbar()}
        {inboxTaskGroups.map((group) => (
          <Collapsible
            key={group.key}
            open={!collapsedTaskSections.has(group.key)}
            onOpenChange={(open) => {
              if (!open) {
                setCollapsedTaskSections((prev) =>
                  new Set(prev).add(group.key)
                );
              } else {
                setCollapsedTaskSections((prev) => {
                  const next = new Set(prev);
                  next.delete(group.key);
                  return next;
                });
              }
            }}
            className="flex flex-col"
          >
            <CollapsibleContent>
              <div className="flex flex-col gap-1">
                {renderInboxSectionHeader(
                  group.label,
                  group.onHeaderClick,
                  () => toggleTaskSectionCollapse(group.key),
                  "Mark as done"
                )}

                <ListGroup className="border-transparent! gap-0.5">
                  <div className="flex flex-col gap-2 px-3 py-1">
                    {group.tasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        id={task.id}
                        text={task.text}
                        isEditable
                        isChecked={checkedTaskKeys.has(task.id)}
                        isMutedAfterCheck
                        className="w-full py-1"
                        onCheckedChange={(checked) => {
                          setCheckedTaskKeys((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(task.id);
                            } else {
                              next.delete(task.id);
                            }
                            return next;
                          });
                        }}
                      />
                    ))}
                  </div>
                </ListGroup>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-8 pb-8">
        {greeting && (
          <div className="heading-2xl text-center text-foreground">
            {greeting}
          </div>
        )}
        {activeTab === "conversations"
          ? renderConversationsTab()
          : renderTasksTab()}
      </div>
    </div>
  );
}
