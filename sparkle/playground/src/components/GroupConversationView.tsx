import {
  Avatar,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Check,
  CheckDouble,
  Cube01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
  ListGroup,
  ListItemSection,
  MessageChatSquare,
  MessageCircle01,
  ReplySection,
  Robot,
  SearchInputWithPopover,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  Umbrella03,
  User01,
  Users01,
  Zap,
} from "@dust-tt/sparkle";
import { UniversalSearchItem } from "@dust-tt/sparkle/components/UniversalSearchItem";
import { cn } from "@sparkle/lib/utils";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import type {
  Agent,
  Conversation,
  DataSource,
  Space,
  Trigger,
  User,
} from "../data/types";
import type { PodTabCustomizationItem } from "./PodCustomizationSection";
import { getAgentById } from "../data/agents";
import {
  getDataSourcesBySpaceId,
  isDataSourceFolder,
  moveDataSource,
} from "../data/dataSources";
import {
  enrichMyPodConversationParticipants,
  isMyPodGroupConversation,
  isMyPodMineConversation,
  isTriggeredConversation,
} from "../data/myPod";
import {
  DEFAULT_POD_NOTIFICATION_CONDITION,
  type PodNotificationCondition,
} from "../data/podSettings";
import { formatRowTime } from "../data/time";
import { getTriggerById } from "../data/triggers";
import { getUserById } from "../data/users";
import { ConversationListItem } from "./ConversationListItem";
import { EmptyState } from "./EmptyState";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { FilesBrowser } from "./FilesBrowser";
import {
  collectAgents,
  collectUsers,
  FilterMenu,
  type FilterGroup,
  type FilterSelection,
} from "./FilterMenu";
import { FrameSheetHeader } from "./FrameSheetHeader";
import {
  DATA_SOURCE_FILE_DRAG_MIME,
  DATA_SOURCE_FILE_NAME_DRAG_MIME,
} from "./FreeButtonSwitch";
import { InputBar } from "./InputBar";
import { NewConversation } from "./NewConversation";
import { PodSettingsSection } from "./PodSettingsSection";
import { TriggerRunAvatar } from "./TriggerRunAvatar";
import { buildConversationRowMenuItems } from "./conversationRowMenu";

/** Mirrors the Inbox clear menu, cut the way a pod's conversations are. */
const MARK_READ_ACTIONS = [
  { id: "all", label: "All conversations", icon: MessageChatSquare },
  { id: "automated", label: "All automated", icon: Zap },
  { id: "group", label: "All group conversations", icon: Users01 },
  { id: "personal", label: "All personal conversations", icon: User01 },
] as const;

interface GroupConversationViewProps {
  space: Space;
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  spaceMemberIds?: string[];
  editorUserIds?: string[];
  onConversationClick?: (conversation: Conversation) => void;
  onInviteMembers?: () => void;
  showToolsAndAboutTabs?: boolean;
  onUpdateSpaceName?: (spaceId: string, newName: string) => void;
  onUpdateSpacePublic?: (spaceId: string, isPublic: boolean) => void;
  spacePublicSettings?: Map<string, boolean>;
  onUpdateSpaceNotifications?: (
    spaceId: string,
    condition: PodNotificationCondition
  ) => void;
  spaceNotificationSettings?: Map<string, PodNotificationCondition>;
  isProjectJoined?: boolean;
  onJoinProject?: () => void;
  onLeaveProject?: () => void;
  selectedConversationId?: string | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  dynamicFileTabIds?: string[];
  onAddFileToTopbar?: (fileId: string) => void;
  /**
   * The Pod's files, rooted at `null`. Defaults to the shared per-space mock
   * set; pass the workspace's own so the Pod and the file system agree.
   */
  initialDataSources?: DataSource[];
  /** When set, opening a file calls this instead of the built-in sheet. */
  onFileOpen?: (dataSource: DataSource) => void;
  onFileDragChange?: (fileId: string | null, fileName?: string | null) => void;
  fileToRevealInKnowledge?: string | null;
  onFileToRevealInKnowledgeHandled?: () => void;
  podVariant?: "shared" | "personal";
  showComposer?: boolean;
  /**
   * Shows a "New" button next to "Mark all as read", and turns an empty
   * Conversations tab into the New conversation screen.
   */
  onNewConversation?: () => void;
  hideConversationFilters?: boolean;
  currentUserId?: string;
  /** The rows read elsewhere, which stop calling for attention here too. */
  readRowIds?: Set<string>;
  /** Reports rows as read, from a row's menu. */
  onRowsRead?: (rowIds: string[]) => void;
  /** The rows put back to unread from a row's menu, dot and all. */
  unreadRowIds?: Set<string>;
  /** Reports rows as unread, from a row's menu. */
  onRowsUnread?: (rowIds: string[]) => void;
  /** Leaves a conversation, which is the end of it in every list. */
  onLeaveConversation?: (conversationId: string) => void;
  /** The conversations already left, kept out of the list. */
  leftConversationIds?: Set<string>;
  /** The triggers behind automated rows, which name their agent and type. */
  triggers?: Trigger[];
  podTabCustomization?: {
    tabs: PodTabCustomizationItem[];
    addableFiles: DataSource[];
    onReorder: (draggedValue: string, targetValue: string) => void;
    onChangeIcon: (tabValue: string, iconName: string) => void;
    onRename: (tabValue: string, title: string) => void;
    onRemove: (tabValue: string) => void;
    onAdd: (file: DataSource) => void;
  };
}

interface Member {
  userId: string;
  joinedAt: Date;
  onClick?: () => void; // For DataTable compatibility
}

type UniversalSearchItem =
  | {
      type: "document";
      dataSource: DataSource;
      title: string;
      description: string;
      score: number;
    }
  | {
      type: "conversation";
      conversation: Conversation;
      creator?: User;
      title: string;
      description: string;
      score: number;
    };

function getParticipantSeedId(participant: {
  type: "user" | "agent";
  data: User | Agent;
}) {
  return participant.type === "user"
    ? (participant.data as User).id
    : (participant.data as Agent).id;
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

  // Shuffle and select 1-6 participants deterministically per row.
  const shuffled = [...allParticipants].sort(
    (a, b) =>
      seededRandom(`${conversation.id}-${getParticipantSeedId(a)}`, 0) -
      seededRandom(`${conversation.id}-${getParticipantSeedId(b)}`, 0)
  );
  const count = Math.min(
    Math.max(1, Math.floor(seededRandom(conversation.id, 1) * 6) + 1),
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
      Math.floor(
        seededRandom(`${conversation.id}-creator`, 0) *
          conversation.userParticipants.length
      )
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

const GENERATED_CONVERSATION_TITLES = [
  "Scope alignment notes",
  "Budget trade-off review",
  "Launch checklist sync",
  "Customer feedback triage",
  "Milestone planning thread",
  "Design direction review",
  "Open blockers roundup",
  "Rollout readiness check",
  "Data quality investigation",
  "Stakeholder update draft",
  "Implementation plan review",
  "Risk register cleanup",
  "Experiment results debrief",
  "Dependency mapping session",
  "Support handoff notes",
  "Roadmap decision recap",
  "Integration follow-up",
  "QA findings review",
  "Weekly progress pulse",
  "Next steps planning",
];

const GENERATED_CONVERSATION_DESCRIPTION_TEMPLATES = [
  "Project discussion covering {title}, owners, open questions, and the next decisions needed to keep work moving.",
  "Follow-up thread for {title}, including context from recent conversations and proposed action items.",
  "Working notes about {title}, with blockers, assumptions, and coordination details for the project team.",
  "Planning conversation focused on {title}, timelines, dependencies, and expected outcomes.",
  "Review thread for {title}, summarizing what changed, what remains unclear, and who should follow up.",
];

// Helper function to generate more conversations with varied dates
function generateConversationsWithDates(
  conversations: Conversation[],
  count: number,
  seed: string
): Conversation[] {
  const now = new Date();
  const generated: Conversation[] = [];

  // Duplicate and vary existing conversations. Each copy is seeded by the
  // conversation it comes from rather than its rank in the list, so dropping
  // one conversation leaves every other row exactly as it was.
  const copiesPerConversation = Math.ceil(count / conversations.length);

  for (const baseConversation of conversations) {
    for (let copy = 0; copy < copiesPerConversation; copy++) {
      const rowSeed = `${seed}-${baseConversation.id}-${copy}`;
      const daysAgo = Math.floor(seededRandom(rowSeed, 0) * 35); // Up to 35 days ago
      const hoursAgo = Math.floor(seededRandom(rowSeed, 1) * 24);
      const minutesAgo = Math.floor(seededRandom(rowSeed, 2) * 60);
      const title =
        GENERATED_CONVERSATION_TITLES[
          Math.floor(
            seededRandom(rowSeed, 3) * GENERATED_CONVERSATION_TITLES.length
          )
        ];
      const descriptionTemplate =
        GENERATED_CONVERSATION_DESCRIPTION_TEMPLATES[
          Math.floor(
            seededRandom(rowSeed, 4) *
              GENERATED_CONVERSATION_DESCRIPTION_TEMPLATES.length
          )
        ];

      const updatedAt = new Date(now);
      updatedAt.setDate(updatedAt.getDate() - daysAgo);
      updatedAt.setHours(updatedAt.getHours() - hoursAgo);
      updatedAt.setMinutes(updatedAt.getMinutes() - minutesAgo);

      const createdAt = new Date(updatedAt);
      createdAt.setDate(
        createdAt.getDate() - Math.floor(seededRandom(rowSeed, 5) * 5)
      );

      // A run is named by the trigger that started it, so repeats of the same
      // automation keep that name instead of borrowing a human thread's.
      const isRun = baseConversation.triggerId !== undefined;

      generated.push({
        ...baseConversation,
        id: `${baseConversation.id}-${copy}`,
        updatedAt,
        createdAt,
        title: isRun ? baseConversation.title : title,
        description: isRun
          ? baseConversation.description
          : descriptionTemplate.replace("{title}", title.toLowerCase()),
      });
    }
  }

  return generated;
}

// Seeded random function for deterministic randomness. The hash folds in the
// position of each character, so seeds that share the same letters — two
// conversation ids apart only in their digits — don't land on the same row.
function seededRandom(seed: string, index: number): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33 + seed.charCodeAt(i)) | 0;
  }
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Generate joinedAt date for a member (deterministic based on space and member ID)
function generateJoinedAt(spaceId: string, memberId: string): Date {
  const now = new Date();
  // Combine spaceId and memberId for seed
  const seed = `${spaceId}-${memberId}`;
  const random = seededRandom(seed, 0);

  // Joined between 365 days ago and now
  const daysAgo = Math.floor(random * 365);
  const joinedAt = new Date(now);
  joinedAt.setDate(joinedAt.getDate() - daysAgo);
  joinedAt.setHours(
    Math.floor(random * 24),
    Math.floor(seededRandom(seed, 1) * 60),
    0,
    0
  );

  return joinedAt;
}

const fakeDocumentFirstLines = [
  "Introduction: This document outlines the initial scope and goals.",
  "Summary: Key findings are consolidated in the sections below.",
  "Overview: A first pass at the requirements and assumptions.",
  "Draft note: Please review the proposed changes and provide feedback.",
  "Excerpt: The following section captures the primary constraints.",
  "Context: This file compiles the core decisions made so far.",
  "Opening: A quick recap of the current state and next steps.",
  "First line: The document begins with a brief background statement.",
];

function getFakeDocumentFirstLine(dataSource: DataSource): string {
  const seed = `${dataSource.id}-${dataSource.fileName}`;
  const index = Math.floor(
    seededRandom(seed, 2) * fakeDocumentFirstLines.length
  );
  return (
    fakeDocumentFirstLines[index] ||
    "Overview: This document contains a summary of the content."
  );
}

function getBaseConversationId(
  conversation: Conversation,
  allConversations: Conversation[]
): string {
  const expandedIdMatch = conversation.id.match(/^(.+)-(\d+)$/);
  if (expandedIdMatch) {
    const potentialBase = expandedIdMatch[1];
    const baseExists = allConversations.some((c) => c.id === potentialBase);
    if (baseExists) {
      return potentialBase;
    }
  }
  return conversation.id;
}

function GroupConversationTabContent({
  value,
  contentClassName,
  fullBleed = false,
  topBox,
  children,
}: {
  value: string;
  contentClassName?: string;
  fullBleed?: boolean;
  topBox?: ReactNode;
  children: ReactNode;
}) {
  // When `topBox` is provided, mirror the NewConversation layout: a tall top
  // region holding the header + input, with the rest of the content scrolling
  // below as the whole page scrolls.
  if (topBox) {
    return (
      <TabsContent value={value}>
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-4">
          <div
            className={cn(
              // flex-1 so an empty state below the input centers on what is
              // left of the panel instead of hugging it.
              "mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 py-8",
              contentClassName
            )}
          >
            {topBox}
            {children}
          </div>
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value={value}>
      <div
        className={cn(
          "flex h-full min-h-0 flex-1 flex-col overflow-y-auto",
          !fullBleed && "px-4"
        )}
      >
        <div
          className={cn(
            "mx-auto flex h-full w-full flex-col",
            fullBleed ? "min-h-0" : "max-w-4xl gap-3 py-6",
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </TabsContent>
  );
}

function ProjectSetupEmptyState() {
  return (
    <EmptyState
      icon={Umbrella03}
      title="It's quiet in here."
      description="Your Pod is ready but empty! Invite people and add key data from Settings."
    />
  );
}

export function GroupConversationView({
  space,
  conversations,
  users,
  agents,
  spaceMemberIds = [],
  editorUserIds = [],
  onConversationClick,
  onInviteMembers,
  showToolsAndAboutTabs = false,
  onUpdateSpaceName,
  onUpdateSpacePublic,
  spacePublicSettings,
  onUpdateSpaceNotifications,
  spaceNotificationSettings,
  isProjectJoined = false,
  onJoinProject = () => {},
  onLeaveProject = () => {},
  selectedConversationId,
  activeTab: controlledActiveTab,
  onTabChange,
  dynamicFileTabIds = [],
  onAddFileToTopbar,
  initialDataSources,
  onFileOpen,
  onFileDragChange,
  fileToRevealInKnowledge = null,
  onFileToRevealInKnowledgeHandled,
  podVariant = "shared",
  showComposer = true,
  onNewConversation,
  hideConversationFilters = false,
  currentUserId,
  readRowIds,
  onRowsRead,
  unreadRowIds,
  onRowsUnread,
  onLeaveConversation,
  leftConversationIds,
  triggers = [],
  podTabCustomization,
}: GroupConversationViewProps) {
  const [searchText, setSearchText] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hideTriggeredConversations, setHideTriggeredConversations] =
    useState(false);
  const [selectedConversationRow, setSelectedConversationRow] = useState<{
    rowId: string;
    conversationId: string;
  } | null>(null);
  const [goodToKnowFilter, setGoodToKnowFilter] = useState<
    "all" | "shared" | "mine"
  >("all");
  const [conversationFilter, setConversationFilter] =
    useState<FilterSelection>(null);

  // Active tab — controlled externally if activeTab/onTabChange props are provided
  const [internalActiveTab, setInternalActiveTab] = useState("conversations");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = useCallback(
    (tab: string) => {
      setInternalActiveTab(tab);
      onTabChange?.(tab);
    },
    [onTabChange]
  );

  // Files tab state
  const [dataSources, setDataSources] = useState<DataSource[]>(
    () => initialDataSources ?? getDataSourcesBySpaceId(space.id)
  );
  const [knowledgeSearchText, setKnowledgeSearchText] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [revealedFileIdInKnowledge, setRevealedFileIdInKnowledge] = useState<
    string | null
  >(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dropHoverTargetId, setDropHoverTargetId] = useState<string | null>(
    null
  );
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [isDocumentSheetOpen, setIsDocumentSheetOpen] = useState(false);
  const [isFrameFullscreen, setIsFrameFullscreen] = useState(false);
  const [pinnedBannerFileId, setPinnedBannerFileId] = useState<string | null>(
    null
  );

  // Members tab state
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);

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
    return generateConversationsWithDates(conversations, targetCount, space.id);
  }, [conversations, space.id]);

  const myPodEnrichedConversations = useMemo(() => {
    if (
      podVariant !== "personal" ||
      !currentUserId ||
      hideConversationFilters
    ) {
      return expandedConversations;
    }
    return expandedConversations.map((conversation) =>
      enrichMyPodConversationParticipants(
        conversation,
        currentUserId,
        users,
        agents
      )
    );
  }, [
    agents,
    currentUserId,
    expandedConversations,
    hideConversationFilters,
    podVariant,
    users,
  ]);

  // The conversations the tab holds before the filter narrows them, so the
  // options never drop out of the menu they were picked from.
  const filterSourceConversations =
    podVariant === "personal"
      ? myPodEnrichedConversations
      : expandedConversations;

  const conversationFilterGroups = useMemo(
    (): FilterGroup[] => [
      {
        kind: "member",
        label: "Member",
        icon: User01,
        options: collectUsers(
          filterSourceConversations.flatMap(
            (conversation) => conversation.userParticipants
          )
        ),
      },
      {
        kind: "agent",
        label: "Agent",
        icon: Robot,
        options: collectAgents(
          filterSourceConversations.flatMap(
            (conversation) => conversation.agentParticipants
          )
        ),
      },
    ],
    [filterSourceConversations]
  );

  const visibleConversations = useMemo(() => {
    const source =
      podVariant === "personal"
        ? myPodEnrichedConversations
        : expandedConversations;

    return source.filter((conversation) => {
      if (leftConversationIds?.has(conversation.id)) {
        return false;
      }
      if (conversationFilter) {
        const matches =
          conversationFilter.kind === "member"
            ? conversation.userParticipants.includes(conversationFilter.value)
            : conversation.agentParticipants.includes(conversationFilter.value);
        if (!matches) {
          return false;
        }
      }
      if (podVariant === "personal" && !hideConversationFilters) {
        if (isTriggeredConversation(conversation)) {
          return false;
        }
      } else if (
        hideTriggeredConversations &&
        isTriggeredConversation(conversation)
      ) {
        return false;
      }
      if (
        hideConversationFilters ||
        podVariant !== "personal" ||
        !currentUserId
      ) {
        return true;
      }
      if (goodToKnowFilter === "mine") {
        return isMyPodMineConversation(conversation, currentUserId);
      }
      if (goodToKnowFilter === "shared") {
        return isMyPodGroupConversation(conversation);
      }
      return true;
    });
  }, [
    conversationFilter,
    currentUserId,
    expandedConversations,
    goodToKnowFilter,
    hideConversationFilters,
    hideTriggeredConversations,
    leftConversationIds,
    myPodEnrichedConversations,
    podVariant,
  ]);

  const searchResults = useMemo((): UniversalSearchItem[] => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      return [];
    }

    const searchLower = trimmed.toLowerCase();

    const documentResults = dataSources.reduce<UniversalSearchItem[]>(
      (acc, dataSource) => {
        const title = dataSource.fileName;
        const description = getFakeDocumentFirstLine(dataSource);
        const titleMatch = title.toLowerCase().includes(searchLower);
        const descriptionMatch = description
          .toLowerCase()
          .includes(searchLower);
        if (titleMatch || descriptionMatch) {
          acc.push({
            type: "document",
            dataSource,
            title,
            description,
            score: titleMatch ? 2 : 1,
          });
        }
        return acc;
      },
      []
    );

    const conversationResults = visibleConversations.reduce<
      UniversalSearchItem[]
    >((acc, conversation) => {
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
    }, []);

    return [...documentResults, ...conversationResults].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });
  }, [dataSources, searchText, users, visibleConversations]);

  const handleSearchItemSelect = (item: UniversalSearchItem) => {
    if (item.type === "document") {
      if (isDataSourceFolder(item.dataSource)) {
        setActiveTab("knowledge");
        setCurrentFolderId(item.dataSource.id);
        setKnowledgeSearchText("");
        setRevealedFileIdInKnowledge(null);
      } else if (onFileOpen) {
        onFileOpen(item.dataSource);
      } else {
        setSelectedDataSource(item.dataSource);
        setIsDocumentSheetOpen(true);
      }
      setIsSearchOpen(false);
      return;
    }

    const baseConversationId = getBaseConversationId(
      item.conversation,
      conversations
    );
    onConversationClick?.({
      ...item.conversation,
      id: baseConversationId,
    });
    setIsSearchOpen(false);
  };

  const SearchResultItem = ({
    item,
    selected,
  }: {
    item: UniversalSearchItem;
    selected: boolean;
  }) => {
    const isDocument = item.type === "document";
    const key = isDocument ? item.dataSource.id : item.conversation.id;
    const onClick = () => handleSearchItemSelect(item);
    const description = isDocument
      ? item.description
      : item.description || "No description available.";
    const visual = isDocument ? (
      item.dataSource.icon ? (
        <Icon visual={item.dataSource.icon} size="md" />
      ) : null
    ) : item.creator ? (
      <Avatar
        name={item.creator.fullName}
        visual={item.creator.portrait}
        size="xs"
        isRounded={true}
      />
    ) : null;
    const titlePrefix =
      !isDocument && item.creator ? item.creator.fullName : "";

    const title = titlePrefix ? (
      <>
        <span className="shrink-0">{titlePrefix}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {item.title}
        </span>
      </>
    ) : (
      <span className="min-w-0 truncate">{item.title}</span>
    );

    return (
      <UniversalSearchItem
        key={key}
        onClick={onClick}
        selected={selected}
        hasSeparator={false}
        visual={visual}
        title={title}
        description={description}
      />
    );
  };

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

    visibleConversations.forEach((conversation) => {
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
  }, [visibleConversations]);

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

  const conversationListItemsById = useMemo(() => {
    const itemMap = new Map<
      string,
      {
        avatarProps: ReturnType<typeof participantsToAvatarProps>;
        creator: User | null;
        mentionCount: number;
        messageCount: number;
        replyCount: number;
        time: string;
        unread: boolean;
        trigger?: Trigger;
      }
    >();

    visibleConversations.forEach((conversation) => {
      const rowSeed = `${space.id}-${conversation.id}-list-item`;
      const participants = getRandomParticipants(conversation, users, agents);
      const replyCount = Math.floor(seededRandom(rowSeed, 0) * 8) + 1;
      const messageCount =
        Math.floor(seededRandom(rowSeed, 1) * replyCount) + 1;
      const mentionCount = Math.floor(
        seededRandom(rowSeed, 2) * (messageCount + 1)
      );

      // A thread you have not read yet is most often a recent one, so age
      // weights the odds rather than deciding them outright.
      const ageInDays =
        (Date.now() - conversation.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
      const unreadOdds = ageInDays < 1 ? 0.6 : ageInDays < 7 ? 0.4 : 0.25;

      itemMap.set(conversation.id, {
        avatarProps: participantsToAvatarProps(participants),
        creator: getRandomCreator(conversation, users),
        mentionCount,
        messageCount,
        replyCount,
        time: formatRowTime(conversation.updatedAt),
        unread: seededRandom(rowSeed, 3) < unreadOdds,
        trigger: conversation.triggerId
          ? getTriggerById(triggers, conversation.triggerId)
          : undefined,
      });
    });

    return itemMap;
  }, [agents, space.id, triggers, users, visibleConversations]);

  // What each entry of the mark-as-read menu would take, so an entry with
  // nothing left to mark reads as disabled, as it does in the Inbox.
  const markableIds = useMemo(() => {
    const unread = visibleConversations.filter((conversation) => {
      const baseId = getBaseConversationId(conversation, conversations);
      if (unreadRowIds?.has(baseId)) {
        return true;
      }
      return (
        (conversationListItemsById.get(conversation.id)?.unread ?? false) &&
        !readRowIds?.has(baseId)
      );
    });
    const idsOf = (list: Conversation[]) =>
      list.map((conversation) =>
        getBaseConversationId(conversation, conversations)
      );

    // Automated, group and personal split the list three ways, in that order.
    const automated = unread.filter(isTriggeredConversation);
    const rest = unread.filter(
      (conversation) => !isTriggeredConversation(conversation)
    );

    return {
      all: idsOf(unread),
      automated: idsOf(automated),
      group: idsOf(rest.filter(isMyPodGroupConversation)),
      personal: idsOf(
        rest.filter((conversation) => !isMyPodGroupConversation(conversation))
      ),
    };
  }, [
    conversationListItemsById,
    conversations,
    readRowIds,
    unreadRowIds,
    visibleConversations,
  ]);

  useEffect(() => {
    if (
      selectedConversationRow &&
      selectedConversationRow.conversationId !== selectedConversationId
    ) {
      setSelectedConversationRow(null);
    }
  }, [selectedConversationId, selectedConversationRow]);

  // Reset data sources when space changes
  useEffect(() => {
    setDataSources(initialDataSources ?? getDataSourcesBySpaceId(space.id));
    setCurrentFolderId(null);
    setRevealedFileIdInKnowledge(null);
    setDraggingFileId(null);
    setDropHoverTargetId(null);
  }, [space.id, initialDataSources]);

  useEffect(() => {
    if (!fileToRevealInKnowledge) {
      return;
    }

    const file = dataSources.find(
      (item) => item.id === fileToRevealInKnowledge
    );
    if (!file || isDataSourceFolder(file)) {
      onFileToRevealInKnowledgeHandled?.();
      return;
    }

    setActiveTab("knowledge");
    setCurrentFolderId(file.parentId);
    setKnowledgeSearchText("");
    setRevealedFileIdInKnowledge(file.id);
    onFileToRevealInKnowledgeHandled?.();
  }, [
    dataSources,
    fileToRevealInKnowledge,
    onFileToRevealInKnowledgeHandled,
    setActiveTab,
  ]);

  const handleFileDragEnd = useCallback(() => {
    setDraggingFileId(null);
    setDropHoverTargetId(null);
    onFileDragChange?.(null, null);
  }, [onFileDragChange]);

  const handleMoveFile = useCallback(
    (fileId: string, targetParentId: string | null) => {
      setDataSources((prev) => moveDataSource(prev, fileId, targetParentId));
      setDraggingFileId(null);
      setDropHoverTargetId(null);
      onFileDragChange?.(null, null);
    },
    [onFileDragChange]
  );

  const handleFileDragStart = useCallback(
    (
      fileId: string,
      fileName: string,
      event: DragEvent<HTMLTableRowElement>
    ) => {
      event.dataTransfer.setData("text/plain", fileId);
      event.dataTransfer.setData(DATA_SOURCE_FILE_DRAG_MIME, "file");
      event.dataTransfer.setData(DATA_SOURCE_FILE_NAME_DRAG_MIME, fileName);
      event.dataTransfer.effectAllowed = "copyMove";
      setDraggingFileId(fileId);
      onFileDragChange?.(fileId, fileName);
    },
    [onFileDragChange]
  );

  useEffect(() => {
    if (draggingFileId === null) {
      return;
    }

    const endFileDrag = () => {
      setDraggingFileId(null);
      setDropHoverTargetId(null);
      onFileDragChange?.(null, null);
    };

    document.addEventListener("dragend", endFileDrag);
    document.addEventListener("drop", endFileDrag);

    return () => {
      document.removeEventListener("dragend", endFileDrag);
      document.removeEventListener("drop", endFileDrag);
    };
  }, [draggingFileId, onFileDragChange]);

  const handleDragOverTarget = useCallback(
    (targetId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropHoverTargetId(targetId);
    },
    []
  );

  const handleDropOnTarget = useCallback(
    (
      targetId: string,
      targetParentId: string | null,
      event: DragEvent<HTMLElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const fileId = event.dataTransfer.getData("text/plain") || draggingFileId;
      if (!fileId) {
        return;
      }

      const file = dataSources.find((item) => item.id === fileId);
      if (!file || file.parentId === targetParentId) {
        handleFileDragEnd();
        return;
      }

      handleMoveFile(fileId, targetParentId);
    },
    [dataSources, draggingFileId, handleFileDragEnd, handleMoveFile]
  );

  // Transform spaceMemberIds into Member objects with joinedAt dates
  const members: Member[] = useMemo(() => {
    if (!spaceMemberIds || spaceMemberIds.length === 0) {
      return [];
    }
    const memberList: Member[] = [];
    spaceMemberIds.forEach((memberId) => {
      const user = getUserById(memberId);
      if (user) {
        memberList.push({
          userId: memberId,
          joinedAt: generateJoinedAt(space.id, memberId),
          onClick: () => {
            setSelectedMember(user);
            setIsMemberSheetOpen(true);
          },
        });
      }
    });
    return memberList;
  }, [spaceMemberIds, space.id]);

  const showMineGroupAll =
    !hideConversationFilters &&
    (podVariant === "personal" || spaceMemberIds.length > 1);
  const canHideTriggered =
    !hideConversationFilters && podVariant !== "personal";

  return (
    <div className="flex h-full w-full h-full flex-col bg-background">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Conversations Tab */}
        {onNewConversation && !hasHistory ? (
          <TabsContent value="conversations">
            <NewConversation
              greeting={`Start the first conversation in ${space.name}`}
              podName={space.name}
            />
          </TabsContent>
        ) : (
          <GroupConversationTabContent
            value="conversations"
            topBox={
              showComposer ? (
                <InputBar
                  autoFocus
                  placeholder="What are we working on?"
                  className="w-full"
                  isFloating={false}
                />
              ) : undefined
            }
          >
            {!hasHistory && showComposer && podVariant !== "personal" && (
              <ProjectSetupEmptyState />
            )}
            {!hasHistory && (podVariant === "personal" || !showComposer) && (
              <EmptyState
                title="No conversations"
                description="Start a conversation from New, or pick one from Recent."
              />
            )}
            {hasHistory && (
              <div className="flex w-full flex-wrap items-center gap-2">
                {showMineGroupAll && (
                  <div className="flex flex-none flex-nowrap items-center gap-2">
                    <ButtonsSwitchList
                      defaultValue={goodToKnowFilter}
                      onValueChange={(value) => {
                        if (
                          value === "all" ||
                          value === "shared" ||
                          value === "mine"
                        ) {
                          setGoodToKnowFilter(value);
                        }
                      }}
                    >
                      <ButtonsSwitch
                        value="mine"
                        label="Mine"
                        tooltip="Conversations where you have sent a message."
                      />
                      <ButtonsSwitch
                        value="shared"
                        label="Group"
                        tooltip="Conversations with more than one person"
                      />
                      <ButtonsSwitch
                        value="all"
                        label="All"
                        tooltip="Every conversation in this Pod."
                      />
                    </ButtonsSwitchList>
                  </div>
                )}
                <div className="flex min-w-[20rem] flex-1 items-center gap-2">
                  <div className="min-w-0 max-w-80 flex-1">
                    <SearchInputWithPopover
                      name="conversation-search"
                      value={searchText}
                      onChange={(value) => {
                        setSearchText(value);
                        if (!value.trim()) {
                          setIsSearchOpen(false);
                        }
                      }}
                      open={isSearchOpen}
                      onOpenChange={setIsSearchOpen}
                      placeholder="Search..."
                      items={searchResults}
                      availableHeight
                      noResults={
                        searchText.trim()
                          ? "No results found"
                          : "Start typing to search"
                      }
                      onItemSelect={handleSearchItemSelect}
                      renderItem={(item, selected) => (
                        <SearchResultItem item={item} selected={selected} />
                      )}
                    />
                  </div>
                  <FilterMenu
                    filter={conversationFilter}
                    groups={conversationFilterGroups}
                    onFilterChange={setConversationFilter}
                    toggles={
                      canHideTriggered
                        ? [
                            {
                              id: "hide-triggered",
                              label: "Hide triggered",
                              checked: hideTriggeredConversations,
                              onChange: setHideTriggeredConversations,
                            },
                          ]
                        : []
                    }
                    searchName="conversation-filter-search"
                    searchPlaceholder="Filter by member or agent"
                  />
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          icon={CheckDouble}
                          size="sm"
                          variant="outline"
                          tooltip="Mark conversations as read."
                          isSelect
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel label="Mark as read" />
                        {MARK_READ_ACTIONS.map(({ id, label, icon }) => (
                          <DropdownMenuItem
                            key={id}
                            label={label}
                            icon={icon}
                            disabled={markableIds[id].length === 0}
                            onClick={() => onRowsRead?.(markableIds[id])}
                          />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {onNewConversation && (
                      <Button
                        variant="highlight"
                        size="sm"
                        icon={MessageCircle01}
                        label="New"
                        tooltip="Create a new conversation"
                        onClick={() => onNewConversation()}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
            {visibleConversations.length > 0 && (
              <>
                <div className="flex flex-col">
                  {(
                    ["Today", "Yesterday", "Last Week", "Last Month"] as const
                  ).map((bucketKey) => {
                    const bucketConversations =
                      conversationsByBucket[bucketKey];
                    if (bucketConversations.length === 0) return null;

                    return (
                      <Fragment key={bucketKey}>
                        <ListItemSection className="pl-4">
                          {bucketKey}
                        </ListItemSection>
                        <ListGroup className="border-transparent! gap-0.5">
                          {bucketConversations.map((conversation) => {
                            const listItem = conversationListItemsById.get(
                              conversation.id
                            );
                            if (!listItem) {
                              return null;
                            }

                            const baseConversationId = getBaseConversationId(
                              conversation,
                              conversations
                            );

                            const conversationForLookup = {
                              ...conversation,
                              id: baseConversationId,
                            };

                            // The row that opened what is on screen, rather than
                            // every row of that conversation: the same thread can
                            // appear more than once in this list.
                            const isSelected =
                              selectedConversationRow?.rowId ===
                              conversation.id;

                            // Read state belongs to the thread, not to the row
                            // that shows it, and what the row's menu says of it
                            // outranks whether anything new came in.
                            const isForcedUnread =
                              unreadRowIds?.has(baseConversationId) ?? false;
                            const isUnread =
                              isForcedUnread ||
                              (listItem.unread &&
                                !readRowIds?.has(baseConversationId));

                            return (
                              <div key={conversation.id}>
                                <ConversationListItem
                                  conversation={conversation}
                                  creator={listItem.creator || undefined}
                                  leadingVisual={
                                    listItem.trigger ? (
                                      <TriggerRunAvatar
                                        trigger={listItem.trigger}
                                      />
                                    ) : undefined
                                  }
                                  className={cn(
                                    "border-t-0 border-b-0 rounded-2xl hover:bg-hover",
                                    isSelected && "bg-highlight-50"
                                  )}
                                  time={listItem.time}
                                  unread={isUnread}
                                  replySection={
                                    // A trigger's run is not a thread you reply
                                    // to, so it reads as it does in the Inbox.
                                    listItem.trigger ? undefined : (
                                      <ReplySection
                                        replyCount={listItem.replyCount}
                                        unreadCount={
                                          isUnread ? listItem.messageCount : 0
                                        }
                                        mentionCount={
                                          isUnread ? listItem.mentionCount : 0
                                        }
                                        avatars={listItem.avatarProps}
                                        lastMessageBy={
                                          listItem.avatarProps[0]?.name ||
                                          "Unknown"
                                        }
                                      />
                                    )
                                  }
                                  menuItems={buildConversationRowMenuItems({
                                    isUnread,
                                    onMarkRead: () =>
                                      onRowsRead?.([baseConversationId]),
                                    onMarkUnread: () =>
                                      onRowsUnread?.([baseConversationId]),
                                    // Leaving takes out the row you clicked, not
                                    // every row sharing its base conversation.
                                    onLeave: () =>
                                      onLeaveConversation?.(conversation.id),
                                  })}
                                  onClick={() => {
                                    setSelectedConversationRow({
                                      rowId: conversation.id,
                                      conversationId: conversationForLookup.id,
                                    });
                                    onConversationClick?.(
                                      conversationForLookup
                                    );
                                  }}
                                />
                              </div>
                            );
                          })}
                        </ListGroup>
                      </Fragment>
                    );
                  })}
                </div>
              </>
            )}
          </GroupConversationTabContent>
        )}

        {/* Files Tab */}
        <GroupConversationTabContent value="knowledge" contentClassName="gap-3">
          <FilesBrowser
            dataSources={dataSources}
            root={{ label: space.name, icon: Cube01 }}
            searchText={knowledgeSearchText}
            onSearchTextChange={setKnowledgeSearchText}
            currentFolderId={currentFolderId}
            onCurrentFolderIdChange={setCurrentFolderId}
            revealedFileId={revealedFileIdInKnowledge}
            onClearRevealedFile={() => setRevealedFileIdInKnowledge(null)}
            emptyMessage="No files in this room yet."
            onAddFileToTopbar={onAddFileToTopbar}
            onFileOpen={(dataSource) => {
              if (onFileOpen) {
                onFileOpen(dataSource);
              } else {
                setSelectedDataSource(dataSource);
                setIsDocumentSheetOpen(true);
              }
            }}
            onDeleteFile={(fileId) =>
              setDataSources((prev) => prev.filter((ds) => ds.id !== fileId))
            }
            dnd={{
              draggingFileId,
              dropHoverTargetId,
              onDragOverTarget: handleDragOverTarget,
              onDropOnTarget: handleDropOnTarget,
              onFileDragStart: handleFileDragStart,
              onFileDragEnd: handleFileDragEnd,
            }}
          />
        </GroupConversationTabContent>

        {dynamicFileTabIds.map((dataSourceId) => {
          const dataSource = dataSources.find(
            (item) => item.id === dataSourceId
          );
          if (!dataSource) {
            return null;
          }

          return (
            <GroupConversationTabContent
              key={dataSourceId}
              value={`file-${dataSourceId}`}
              fullBleed
            >
              <FilePreviewPanel dataSource={dataSource} variant="document" />
            </GroupConversationTabContent>
          );
        })}

        {/* About Tab */}
        {showToolsAndAboutTabs && (
          <GroupConversationTabContent value="about" contentClassName="gap-4">
            <p className="text-foreground">{space.description}</p>
          </GroupConversationTabContent>
        )}

        {/* Settings Tab */}
        <GroupConversationTabContent value="settings" fullBleed>
          <PodSettingsSection
            key={space.id}
            space={space}
            members={members}
            editorUserIds={editorUserIds}
            isPublic={
              spacePublicSettings?.get(space.id) ?? space.isPublic ?? true
            }
            notificationCondition={
              spaceNotificationSettings?.get(space.id) ??
              DEFAULT_POD_NOTIFICATION_CONDITION
            }
            onUpdateSpaceName={onUpdateSpaceName}
            onUpdateSpacePublic={onUpdateSpacePublic}
            onUpdateSpaceNotifications={onUpdateSpaceNotifications}
            onInviteMembers={onInviteMembers}
            podTabCustomization={podTabCustomization}
          />
        </GroupConversationTabContent>
      </Tabs>

      {/* Document View Sheet */}
      <Sheet
        open={isDocumentSheetOpen}
        onOpenChange={(open: boolean) => {
          setIsDocumentSheetOpen(open);
          if (!open) {
            setSelectedDataSource(null);
            setIsFrameFullscreen(false);
          }
        }}
      >
        <SheetContent
          size="3xl"
          side="right"
          className={cn(
            selectedDataSource?.fileType === "frame" &&
              isFrameFullscreen &&
              "inset-0 sm:max-w-none"
          )}
          onEscapeKeyDown={(event) => {
            if (selectedDataSource?.fileType === "frame" && isFrameFullscreen) {
              event.preventDefault();
              setIsFrameFullscreen(false);
            }
          }}
        >
          {selectedDataSource?.fileType === "frame" ? (
            <>
              <FrameSheetHeader
                title={selectedDataSource.fileName}
                isFullscreen={isFrameFullscreen}
                isPinnedAsBanner={pinnedBannerFileId === selectedDataSource.id}
                onToggleFullscreen={() =>
                  setIsFrameFullscreen((previous) => !previous)
                }
                onAddToTopBar={
                  onAddFileToTopbar
                    ? () => onAddFileToTopbar(selectedDataSource.id)
                    : undefined
                }
                onAddAsBanner={() =>
                  setPinnedBannerFileId((previous) =>
                    previous === selectedDataSource.id
                      ? null
                      : selectedDataSource.id
                  )
                }
              />
              <SheetContainer isListSelector noScroll>
                <FilePreviewPanel
                  dataSource={selectedDataSource}
                  variant="document"
                />
              </SheetContainer>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedDataSource?.fileName ?? "File"}
                </SheetTitle>
              </SheetHeader>
              <SheetContainer isListSelector noScroll>
                {selectedDataSource ? (
                  <FilePreviewPanel
                    dataSource={selectedDataSource}
                    variant="document"
                  />
                ) : null}
              </SheetContainer>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Member Detail Sheet */}
      <Sheet
        open={isMemberSheetOpen}
        onOpenChange={(open: boolean) => {
          setIsMemberSheetOpen(open);
          if (!open) {
            setSelectedMember(null);
          }
        }}
      >
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>
              {selectedMember?.fullName || "Member detailview"}
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-foreground">Member detailview</p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
