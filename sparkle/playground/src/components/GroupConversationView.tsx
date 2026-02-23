import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  Avatar,
  BookOpenIcon,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Card,
  CardGrid,
  ChatBubbleLeftRightIcon,
  CheckDoubleIcon,
  CheckIcon,
  Chip,
  Cog6ToothIcon,
  ConversationListItem,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  EmptyCTAButton,
  ExternalLinkIcon,
  Icon,
  InformationCircleIcon,
  Input,
  ListGroup,
  ListItemSection,
  LogoutIcon,
  MagicIcon,
  MoreIcon,
  ReplySection,
  SearchInput,
  SearchInputWithPopover,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToolsIcon,
  TrashIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { UniversalSearchItem } from "@dust-tt/sparkle/components/UniversalSearchItem";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import { getAgentById } from "../data/agents";
import { getDataSourcesBySpaceId } from "../data/dataSources";
import type {
  Agent,
  Conversation,
  DataSource,
  Space,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";

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
  isProjectJoined?: boolean;
  onJoinProject?: () => void;
  onLeaveProject?: () => void;
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
  isProjectJoined = false,
  onJoinProject = () => {},
  onLeaveProject = () => {},
}: GroupConversationViewProps) {
  const [searchText, setSearchText] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Settings state
  const [roomName, setRoomName] = useState(space.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [roomDescription, setRoomDescription] = useState(
    space.description ?? ""
  );
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editorIds, setEditorIds] = useState<string[]>(editorUserIds);
  const [isPublic, setIsPublic] = useState(
    spacePublicSettings?.get(space.id) ?? space.isPublic ?? true
  );
  const [showNameSaveDialog, setShowNameSaveDialog] = useState(false);
  const [showPublicToggleDialog, setShowPublicToggleDialog] = useState(false);
  const [pendingPublicValue, setPendingPublicValue] = useState<boolean | null>(
    null
  );

  // Active tab (for switching from suggestion cards)
  const [activeTab, setActiveTab] = useState("conversations");

  // Knowledge tab state
  const [dataSources, setDataSources] = useState<DataSource[]>(() =>
    getDataSourcesBySpaceId(space.id)
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<
    string | null
  >(null);
  const [knowledgeSearchText, setKnowledgeSearchText] = useState("");
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [isDocumentSheetOpen, setIsDocumentSheetOpen] = useState(false);
  const [documentView, setDocumentView] = useState<"preview" | "extracted">(
    "preview"
  );

  // Members tab state
  const [membersSearchText, setMembersSearchText] = useState("");
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [selectedMemberIdToRemove, setSelectedMemberIdToRemove] = useState<
    string | null
  >(null);

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

    const conversationResults = expandedConversations.reduce<
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
  }, [dataSources, expandedConversations, searchText, users]);

  const handleSearchItemSelect = (item: UniversalSearchItem) => {
    if (item.type === "document") {
      setSelectedDataSource(item.dataSource);
      setIsDocumentSheetOpen(true);
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
        <span className="s-shrink-0">{titlePrefix}</span>
        <span className="s-min-w-0 s-truncate s-text-muted-foreground dark:s-text-muted-foreground-night">
          {item.title}
        </span>
      </>
    ) : (
      <span className="s-min-w-0 s-truncate">{item.title}</span>
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
    setRoomDescription(space.description ?? "");
    setIsEditingDescription(false);
    setEditorIds(editorUserIds);
    setIsPublic(spacePublicSettings?.get(space.id) ?? space.isPublic ?? true);
  }, [space.id, space.name, spacePublicSettings, space.isPublic]);

  useEffect(() => {
    setEditorIds(editorUserIds);
  }, [editorUserIds]);

  // Reset data sources when space changes
  useEffect(() => {
    setDataSources(getDataSourcesBySpaceId(space.id));
  }, [space.id]);

  // Transform data sources to include onClick handlers
  const dataSourcesWithClick = useMemo(() => {
    return dataSources.map((ds) => ({
      ...ds,
      onClick: () => {
        setSelectedDataSource(ds);
        setIsDocumentSheetOpen(true);
      },
    }));
  }, [dataSources]);

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

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (selectedDataSourceId) {
      setDataSources((prev) =>
        prev.filter((ds) => ds.id !== selectedDataSourceId)
      );
      setSelectedDataSourceId(null);
    }
    setDeleteDialogOpen(false);
  };

  // Handle remove member confirmation
  const handleRemoveMemberConfirm = () => {
    if (selectedMemberIdToRemove) {
      // For prototyping, we'll just filter from the members list
      // In a real app, this would call a callback prop
      setSelectedMemberIdToRemove(null);
    }
    setRemoveMemberDialogOpen(false);
  };

  const toggleMemberEditor = (userId: string) => {
    setEditorIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Create table columns
  const columns: ColumnDef<DataSource & { onClick?: () => void }>[] = useMemo(
    () => [
      {
        accessorKey: "fileName",
        header: "File name",
        id: "fileName",
        sortingFn: "text",
        meta: {
          className: "s-w-full",
        },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="s-flex s-items-center s-gap-2">
              {info.row.original.icon && (
                <Icon visual={info.row.original.icon} size="sm" />
              )}
              <span>{info.getValue() as string}</span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "createdBy",
        header: "Created by",
        id: "createdBy",
        meta: {
          className: "s-w-[180px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="s-text-sm">{user.fullName}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Last Updated",
        id: "lastUpdated",
        meta: {
          className: "s-w-[140px]",
        },
        cell: (info) => {
          const date = info.getValue() as Date;
          return <DataTable.BasicCellContent label={formatDate(date)} />;
        },
      },
      {
        id: "actions",
        header: "",
        meta: {
          className: "s-w-12",
        },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                label: "Delete",
                icon: TrashIcon,
                variant: "warning",
                onClick: () => {
                  setSelectedDataSourceId(info.row.original.id);
                  setDeleteDialogOpen(true);
                },
              },
            ]}
          />
        ),
      },
    ],
    []
  );

  // Create member table columns
  const memberColumns: ColumnDef<Member>[] = useMemo(
    () => [
      {
        accessorKey: "userId",
        header: "Name",
        id: "name",
        sortingFn: "text",
        meta: {
          className: "s-w-full",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="s-text-sm">{user.fullName}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "userId",
        header: "Email",
        id: "email",
        meta: {
          className: "s-w-[200px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return <DataTable.BasicCellContent label={user.email} />;
        },
      },
      {
        accessorKey: "userId",
        header: "Role",
        id: "role",
        meta: {
          className: "s-w-[120px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          return editorIds.includes(userId) ? (
            <DataTable.CellContent>
              <Chip size="xs" color="green" label="editor" />
            </DataTable.CellContent>
          ) : (
            <DataTable.BasicCellContent label="" />
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: "Joined at",
        id: "joinedAt",
        meta: {
          className: "s-w-[140px]",
        },
        cell: (info) => {
          const date = info.getValue() as Date;
          return <DataTable.BasicCellContent label={formatDate(date)} />;
        },
      },
      {
        id: "actions",
        header: "",
        meta: {
          className: "s-w-12",
        },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                icon: editorIds.includes(info.row.original.userId)
                  ? XMarkIcon
                  : CheckIcon,
                label: editorIds.includes(info.row.original.userId)
                  ? "Remove from editors"
                  : "Set as editor",
                onClick: () => {
                  toggleMemberEditor(info.row.original.userId);
                },
              },
              {
                kind: "item",
                label: "Remove from Room",
                icon: TrashIcon,
                variant: "warning",
                onClick: () => {
                  setSelectedMemberIdToRemove(info.row.original.userId);
                  setRemoveMemberDialogOpen(true);
                },
              },
            ]}
          />
        ),
      },
    ],
    [editorIds]
  );

  // Filter members based on search text
  const filteredMembers = useMemo(() => {
    if (!membersSearchText.trim()) {
      return members;
    }
    const searchLower = membersSearchText.toLowerCase();
    return members.filter((member) => {
      const user = getUserById(member.userId);
      if (!user) return false;
      return (
        user.fullName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    });
  }, [members, membersSearchText]);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <div className="s-flex s-h-14 s-w-full s-items-center s-gap-2 s-border-b s-border-border s-px-6">
          <div className="s-flex s-h-full s-flex-1 s-items-end">
            <TabsList border={false}>
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
            </TabsList>
          </div>
          <div className="s-flex-1" />
          {spaceAvatars.length > 0 && (
            <div className="s-flex s-h-8 s-items-center">
              <Avatar.Stack
                avatars={spaceAvatars}
                nbVisibleItems={spaceAvatars.length}
                orientation="horizontal"
                hasMagnifier={false}
                size="sm"
              />
            </div>
          )}
          {isProjectJoined ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={MoreIcon}
                  tooltip="Project options"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Leave the project"
                  icon={LogoutIcon}
                  onClick={onLeaveProject}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="primary"
              label="Join the project"
              tooltip="Join the project to be notified of new conversations"
              onClick={onJoinProject}
            />
          )}
        </div>

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

                {/* Suggestions for empty rooms */}
                {!hasHistory && (
                  <div className="s-flex s-flex-col s-gap-5">
                    <div className="s-flex s-flex-col s-gap-3">
                      <h3 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                        New Project? Let us help you setup.
                      </h3>
                      <CardGrid>
                        {[
                          {
                            id: "kickoff",
                            label: "Kick-off your project",
                            icon: MagicIcon,
                            variant: "highlight" as const,
                            description:
                              "Let us help you get started with your project.",
                            onClick: () => {},
                            isPulsing: true,
                          },
                          {
                            id: "add-knowledge",
                            label: "Add knowledge",
                            variant: "primary" as const,
                            icon: BookOpenIcon,
                            description:
                              "Centralize the information used in this project for Agents and Participants.",
                            onClick: () => setActiveTab("knowledge"),
                            isPulsing: false,
                          },
                          {
                            id: "invite-members",
                            label: "Manage members",
                            variant: "primary" as const,
                            icon: UserGroupIcon,
                            description:
                              "Invite team members to collaborate and participate in this room.",
                            onClick: () => onInviteMembers?.(),
                            isPulsing: false,
                          },
                        ].map((suggestion) => (
                          <Card
                            key={suggestion.id}
                            variant={suggestion.variant}
                            size="lg"
                            onClick={suggestion.onClick}
                            className="s-cursor-pointer"
                          >
                            <div className="s-flex s-w-full s-flex-col s-gap-2 s-text-sm">
                              <div
                                className={`s-flex s-w-full s-items-center s-gap-2 s-font-semibold ${
                                  suggestion.variant === "highlight"
                                    ? "s-text-highlight-600 dark:s-text-highlight-400"
                                    : "s-text-foreground dark:s-text-foreground-night"
                                }`}
                              >
                                <Icon visual={suggestion.icon} size="sm" />
                                <div className="s-w-full">
                                  {suggestion.label}
                                </div>
                              </div>
                              {suggestion.description && (
                                <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                                  {suggestion.description}
                                </div>
                              )}
                            </div>
                          </Card>
                        ))}
                      </CardGrid>
                    </div>
                    <h3 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                      Start a first conversation!
                    </h3>
                  </div>
                )}
                <InputBar
                  placeholder={`Start a conversation in ${space.name}`}
                />
              </div>

              {/* Conversations list */}
              <div className="s-flex s-flex-col s-gap-3">
                {expandedConversations.length > 0 && (
                  <>
                    <div className="s-flex s-w-full s-gap-2 s-px-3">
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
                        placeholder={`Search in ${space.name}`}
                        className="s-w-full"
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
                      <Button
                        icon={CheckDoubleIcon}
                        variant="outline"
                        label="Mark all as read"
                      />
                    </div>
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

                                // Generate random counts respecting mentionCount <= unreadCount <= replyCount
                                const replyCount = Math.floor(
                                  Math.random() * 8 + 1
                                );
                                const messageCount = Math.floor(
                                  Math.random() * replyCount + 1
                                );
                                const mentionCount = Math.floor(
                                  Math.random() * (messageCount + 1)
                                );

                                const baseConversationId =
                                  getBaseConversationId(
                                    conversation,
                                    conversations
                                  );

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
                                        replyCount={replyCount}
                                        unreadCount={
                                          bucketKey === "Today"
                                            ? messageCount
                                            : 0
                                        }
                                        mentionCount={
                                          bucketKey === "Today"
                                            ? mentionCount
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
        <TabsContent value="knowledge">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
            <div className="s-mx-auto s-flex s-w-full s-flex-col s-gap-4 s-py-8">
              <div className="s-flex s-gap-2">
                <h3 className="s-heading-2xl s-flex-1 s-items-center">
                  Knowledge
                </h3>
                <Button
                  variant="outline"
                  icon={ArrowUpOnSquareIcon}
                  label="Add knowledge"
                />
              </div>
              {dataSources.length === 0 ? (
                <EmptyCTA
                  message="No knowledge files in this room yet."
                  action={
                    <EmptyCTAButton
                      icon={ArrowUpOnSquareIcon}
                      label="Add knowledge"
                    />
                  }
                />
              ) : (
                <>
                  <SearchInput
                    name="knowledge-search"
                    value={knowledgeSearchText}
                    onChange={setKnowledgeSearchText}
                    placeholder="Search files..."
                    className="s-w-full"
                  />
                  <DataTable
                    columns={columns}
                    data={dataSourcesWithClick}
                    filter={knowledgeSearchText}
                    filterColumn="fileName"
                    sorting={[{ id: "fileName", desc: false }]}
                  />
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* About Tab */}
        {showToolsAndAboutTabs && (
          <TabsContent value="about">
            <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
              <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-4 s-py-8">
                <h2 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
                  About {space.name}
                </h2>
                <p className="s-text-foreground dark:s-text-foreground-night">
                  {space.description}
                </p>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
            <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-8 s-px-6 s-py-8">
              {/* Room Name Section */}
              <div className="s-flex s-gap-2">
                <h3 className="s-heading-2xl s-flex-1">Settings</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" icon={MoreIcon} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      icon={TrashIcon}
                      label="Archive project"
                      variant="warning"
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="s-flex s-w-full s-flex-col s-gap-2">
                <h3 className="s-heading-lg">Name</h3>
                <div className="s-flex s-w-full s-min-w-0 s-gap-2">
                  <Input
                    value={roomName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
              <div className="s-flex s-w-full s-flex-col s-gap-2">
                <h3 className="s-heading-lg">Description</h3>
                <div className="s-flex s-w-full s-min-w-0 s-gap-2">
                  <Input
                    value={roomDescription}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setRoomDescription(e.target.value);
                      setIsEditingDescription(
                        e.target.value !== (space.description ?? "")
                      );
                    }}
                    placeholder="Enter room description"
                    containerClassName="s-flex-1"
                  />
                  {isEditingDescription && (
                    <>
                      <Button
                        label="Save"
                        variant="highlight"
                        onClick={() => {
                          setIsEditingDescription(false);
                        }}
                      />
                      <Button
                        label="Cancel"
                        variant="outline"
                        onClick={() => {
                          setRoomDescription(space.description ?? "");
                          setIsEditingDescription(false);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
              {/* Open to Everyone Section */}

              <div className="s-flex s-w-full s-flex-col s-gap-2">
                <h3 className="s-heading-lg">Visibility</h3>
                <div className="s-flex s-items-start s-items-center s-justify-between s-gap-4 s-border-y s-border-border s-py-4">
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
                  <h3 className="s-heading-lg s-flex-1">Members & Editors</h3>
                  <Button
                    label="Manage"
                    variant="outline"
                    icon={UserGroupIcon}
                    onClick={() => onInviteMembers?.()}
                  />
                </div>
                {members.length === 0 ? (
                  <EmptyCTA
                    message="Feeling lonely? Invite participants!."
                    action={
                      <EmptyCTAButton
                        icon={UserGroupIcon}
                        label="Invite"
                        onClick={() => onInviteMembers?.()}
                      />
                    }
                  />
                ) : (
                  <>
                    <SearchInput
                      name="members-search"
                      value={membersSearchText}
                      onChange={setMembersSearchText}
                      placeholder="Search members..."
                      className="s-w-full"
                    />
                    <DataTable
                      columns={memberColumns}
                      data={filteredMembers}
                      sorting={[{ id: "name", desc: false }]}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialogs */}
      {/* Name Save Dialog */}
      <Dialog
        open={showNameSaveDialog}
        onOpenChange={(open: boolean) => {
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
        onOpenChange={(open: boolean) => {
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

      {/* Delete DataSource Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleteDialogOpen(false);
            setSelectedDataSourceId(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {selectedDataSourceId && (
              <div>
                Are you sure you want to delete "
                {dataSources.find((ds) => ds.id === selectedDataSourceId)
                  ?.fileName || "this file"}
                "? This action cannot be undone.
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setDeleteDialogOpen(false);
                setSelectedDataSourceId(null);
              },
            }}
            rightButtonProps={{
              label: "Delete",
              variant: "warning",
              onClick: handleDeleteConfirm,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog
        open={removeMemberDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRemoveMemberDialogOpen(false);
            setSelectedMemberIdToRemove(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Remove member from room?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {selectedMemberIdToRemove && (
              <div>
                Are you sure you want to remove "
                {getUserById(selectedMemberIdToRemove)?.fullName ||
                  "this member"}
                " from this room?
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setRemoveMemberDialogOpen(false);
                setSelectedMemberIdToRemove(null);
              },
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              onClick: handleRemoveMemberConfirm,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Document View Sheet */}
      <Sheet
        open={isDocumentSheetOpen}
        onOpenChange={(open: boolean) => {
          setIsDocumentSheetOpen(open);
          if (!open) {
            setSelectedDataSource(null);
            setDocumentView("preview");
          }
        }}
      >
        <SheetContent size="3xl" side="right">
          <SheetHeader>
            <SheetTitle>
              <div className="s-flex s-flex-1 s-flex-col s-w-full s-items-start s-gap-4">
                <div className="s-flex s-items-center s-gap-2">
                  {selectedDataSource?.icon && (
                    <Icon visual={selectedDataSource.icon} size="md" />
                  )}
                  <span>{selectedDataSource?.fileName || "Document View"}</span>
                </div>
                <div className="s-flex s-w-full s-items-center s-gap-2">
                  <ButtonsSwitchList
                    defaultValue="preview"
                    size="xs"
                    onValueChange={(value) => {
                      if (value === "preview" || value === "extracted") {
                        setDocumentView(value);
                      }
                    }}
                  >
                    <ButtonsSwitch value="preview" label="Preview" />
                    <ButtonsSwitch
                      value="extracted"
                      label="Extracted information"
                    />
                  </ButtonsSwitchList>
                  <div className="s-flex-1" />
                  <div className="s-flex s-items-center s-gap-2">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ArrowDownOnSquareIcon}
                      tooltip="Download"
                    />
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ExternalLinkIcon}
                      tooltip="Open in tab"
                    />
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                {documentView === "preview"
                  ? "Document Preview"
                  : "Extracted information"}
              </p>
            </div>
          </SheetContainer>
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
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                Member detailview
              </p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
