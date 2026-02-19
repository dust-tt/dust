import {
  Avatar,
  BoltOffIcon,
  BookOpenIcon,
  Button,
  Card,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ContactsUserIcon,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  FullscreenExitIcon,
  FullscreenIcon,
  HeartIcon,
  InboxIcon,
  LightbulbIcon,
  ListSelectIcon,
  LogoutIcon,
  Icon,
  MagnifyingGlassIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  PuzzleIcon,
  ScrollArea,
  ScrollBar,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SidebarLayout,
  type SidebarLayoutRef,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  SlackLogo,
  SpaceClosedIcon,
  SpaceOpenIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  UserIcon,
  Spinner,
  AtomIcon,
  CodeSlashIcon,
} from "@dust-tt/sparkle";
import {
  SearchInput,
  SearchInputWithPopover,
} from "@dust-tt/sparkle/components/SearchInput";
import { UniversalSearchItem } from "@dust-tt/sparkle/components/UniversalSearchItem";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationView } from "../components/ConversationView";
import { CreateRoomDialog } from "../components/CreateRoomDialog";
import { GroupConversationView } from "../components/GroupConversationView";
import { InboxView } from "../components/InboxView";
import { InputBar } from "../components/InputBar";
import { InviteUsersScreen } from "../components/InviteUsersScreen";
import { ProfilePanel } from "../components/Profile";
import {
  type Agent,
  type Conversation,
  createConversationsWithMessages,
  createSpace,
  getAgentById,
  getConversationsBySpaceId,
  getMembersBySpaceId,
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  getUserById,
  mockAgents,
  mockConversations,
  mockSpaces,
  mockUsers,
  type Space,
  type User,
} from "../data";
import { getDataSourcesBySpaceId } from "../data/dataSources";
import type { DataSource } from "../data/types";
import { AgentBuilderView } from "../components/AgentBuilderView";
import TemplateSelection, { type Template } from "./TemplateSelection";

type Collaborator =
  | { type: "agent"; data: Agent }
  | { type: "person"; data: User };

type Participant =
  | { type: "user"; data: User }
  | { type: "agent"; data: Agent };

type UniversalSearchItem =
  | {
      type: "document";
      dataSource: DataSource;
      space: Space;
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
    }
  | {
      type: "project";
      space: Space;
      title: string;
      description: string;
      score: number;
    }
  | {
      type: "person";
      user: User;
      title: string;
      description: string;
      score: number;
    };

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
  const index = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (
    fakeDocumentFirstLines[index % fakeDocumentFirstLines.length] ||
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

function getRandomParticipants(conversation: Conversation): Participant[] {
  const allParticipants: Participant[] = [];

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

function getRandomCreator(conversation: Conversation): User | null {
  if (conversation.userParticipants.length === 0) {
    return null;
  }
  const creatorId =
    conversation.userParticipants[
      Math.floor(Math.random() * conversation.userParticipants.length)
    ];
  return getUserById(creatorId) || null;
}

function DustMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [projectSearchText, setProjectSearchText] = useState("");
  const [agentSearchText, setAgentSearchText] = useState("");
  const [peopleSearchText, setPeopleSearchText] = useState("");
  const [universalSearchText, setUniversalSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >("new-conversation");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [previousSpaceId, setPreviousSpaceId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<
    "inbox" | "space" | "conversation" | "templates" | null
  >("inbox");
  const [cameFromInbox, setCameFromInbox] = useState<boolean>(false);
  const [isUniversalSearchOpen, setIsUniversalSearchOpen] = useState(false);
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [isDocumentSheetOpen, setIsDocumentSheetOpen] = useState(false);
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    Conversation[]
  >([]);
  const [isCreateRoomDialogOpen, setIsCreateRoomDialogOpen] = useState(false);
  const [selectedTemplateForBuilder, setSelectedTemplateForBuilder] =
    useState<Template | null>(null);
  const [isInviteUsersScreenOpen, setIsInviteUsersScreenOpen] = useState(false);
  const [lastCreatedSpaceId, setLastCreatedSpaceId] = useState<string | null>(
    null
  );
  const [inviteSpaceId, setInviteSpaceId] = useState<string | null>(null);
  const [spaceMembers, setSpaceMembers] = useState<Map<string, string[]>>(
    new Map()
  );
  const [spaceEditors, setSpaceEditors] = useState<Map<string, string[]>>(
    new Map()
  );
  const [spacePublicSettings, setSpacePublicSettings] = useState<
    Map<string, boolean>
  >(new Map());

  // Track sidebar collapsed state for toggle button icon
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [isAgentsDropdownOpen, setIsAgentsDropdownOpen] = useState(false);
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);

  // Initialize space members with generated members when a space is first selected
  useEffect(() => {
    if (selectedSpaceId && !spaceMembers.has(selectedSpaceId)) {
      const generatedMembers = getMembersBySpaceId(selectedSpaceId);
      setSpaceMembers((prev) => {
        const newMap = new Map(prev);
        newMap.set(selectedSpaceId, generatedMembers);
        return newMap;
      });
    }
  }, [selectedSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);

    // Generate random total count of collaborators between 2 and 12
    const totalCount = Math.floor(Math.random() * (12 - 2 + 1)) + 2;

    // Randomly decide how many agents and people
    const agentCount = Math.floor(Math.random() * (totalCount - 1)) + 1;
    const peopleCount = totalCount - agentCount;

    const randomAgents = getRandomAgents(agentCount);
    const randomPeople = getRandomUsers(peopleCount);

    // Create mixed collaborator list
    const mixedCollaborators: Collaborator[] = [
      ...randomAgents.map((agent) => ({ type: "agent" as const, data: agent })),
      ...randomPeople.map((person) => ({
        type: "person" as const,
        data: person,
      })),
    ];

    setCollaborators(mixedCollaborators);

    // Generate random number of joined projects between 2 and 12
    const spaceCount = Math.floor(Math.random() * (12 - 2 + 1)) + 2;
    const randomSpaces = getRandomSpaces(spaceCount);
    setSpaces(randomSpaces);

    // Create conversations with messages
    const convsWithMessages = createConversationsWithMessages(randomUser.id);
    setConversationsWithMessages(convsWithMessages);
  }, []);

  const isProjectJoined = (spaceId: string) => {
    return spaces.some((space) => space.id === spaceId);
  };

  const joinProject = (space: Space) => {
    setSpaces((prev) => {
      if (prev.some((item) => item.id === space.id)) {
        return prev;
      }
      return [...prev, space];
    });
  };

  const leaveProject = (spaceId: string) => {
    setSpaces((prev) => prev.filter((space) => space.id !== spaceId));
    if (selectedSpaceId === spaceId) {
      setSelectedSpaceId(null);
      setSelectedConversationId(null);
      setSelectedView("inbox");
      setPreviousSpaceId(null);
      setCameFromInbox(false);
    }
  };

  // Auto-select newly created space when it's added to the spaces array
  useEffect(() => {
    if (lastCreatedSpaceId && spaces.find((s) => s.id === lastCreatedSpaceId)) {
      setSelectedSpaceId(lastCreatedSpaceId);
      setSelectedConversationId(null);
      setLastCreatedSpaceId(null);
    }
  }, [spaces, lastCreatedSpaceId]);

  // Combine mock conversations with conversations that have messages
  const allConversations = useMemo(() => {
    return [...conversationsWithMessages, ...mockConversations];
  }, [conversationsWithMessages]);

  const documentDataSources = useMemo(() => {
    const seeds = [
      "global-documents",
      "global-documents-1",
      "global-documents-2",
      "global-documents-3",
    ];
    for (const seed of seeds) {
      const dataSources = getDataSourcesBySpaceId(seed);
      if (dataSources.length > 0) {
        return dataSources;
      }
    }
    return [];
  }, []);
  const defaultDocumentSpace = mockSpaces[0];

  const universalSearchResults = useMemo((): UniversalSearchItem[] => {
    const trimmed = universalSearchText.trim();
    if (!trimmed) {
      return [];
    }

    const searchLower = trimmed.toLowerCase();

    const documentResults = defaultDocumentSpace
      ? documentDataSources.reduce<UniversalSearchItem[]>((acc, dataSource) => {
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
              space: defaultDocumentSpace,
              title,
              description,
              score: titleMatch ? 2 : 1,
            });
          }
          return acc;
        }, [])
      : [];

    const projectResults = mockSpaces.reduce<UniversalSearchItem[]>(
      (acc, space) => {
        const title = space.name;
        const description = space.description;
        const titleMatch = title.toLowerCase().includes(searchLower);
        const descriptionMatch = description
          .toLowerCase()
          .includes(searchLower);
        if (titleMatch || descriptionMatch) {
          acc.push({
            type: "project",
            space,
            title,
            description,
            score: titleMatch ? 2 : 1,
          });
        }
        return acc;
      },
      []
    );

    const peopleResults = mockUsers.reduce<UniversalSearchItem[]>(
      (acc, user) => {
        const title = user.fullName;
        const description = user.email;
        const titleMatch = title.toLowerCase().includes(searchLower);
        const descriptionMatch = description
          .toLowerCase()
          .includes(searchLower);
        if (titleMatch || descriptionMatch) {
          acc.push({
            type: "person",
            user,
            title,
            description,
            score: titleMatch ? 2 : 1,
          });
        }
        return acc;
      },
      []
    );

    const conversationResults = allConversations.reduce<UniversalSearchItem[]>(
      (acc, conversation) => {
        const creator = getRandomCreator(conversation);
        const title = conversation.title;
        const description = conversation.description ?? "";
        const searchableTitle = creator
          ? `${creator.fullName} ${title}`
          : title;
        const titleMatch = searchableTitle.toLowerCase().includes(searchLower);
        const descriptionMatch = description
          .toLowerCase()
          .includes(searchLower);
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
      },
      []
    );

    return [
      ...documentResults,
      ...projectResults,
      ...peopleResults,
      ...conversationResults,
    ].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });
  }, [
    allConversations,
    defaultDocumentSpace,
    documentDataSources,
    mockUsers,
    universalSearchText,
  ]);

  const handleUniversalSearchSelect = (item: UniversalSearchItem) => {
    if (item.type === "document") {
      setSelectedDataSource(item.dataSource);
      setIsDocumentSheetOpen(true);
      setIsUniversalSearchOpen(false);
      return;
    }

    if (item.type === "project") {
      setSelectedSpaceId(item.space.id);
      setSelectedView("space");
      setSelectedConversationId(null);
      setPreviousSpaceId(null);
      setCameFromInbox(false);
      setIsUniversalSearchOpen(false);
      return;
    }

    if (item.type === "person") {
      setIsUniversalSearchOpen(false);
      return;
    }

    const baseConversationId = getBaseConversationId(
      item.conversation,
      allConversations
    );
    setSelectedConversationId(baseConversationId);
    setSelectedView("conversation");
    setSelectedSpaceId(item.conversation.spaceId ?? null);
    setPreviousSpaceId(null);
    setCameFromInbox(false);
    setIsUniversalSearchOpen(false);
  };

  const UniversalSearchResultItem = ({
    item,
    selected,
  }: {
    item: UniversalSearchItem;
    selected: boolean;
  }) => {
    const getVisual = () => {
      if (item.type === "document") {
        return item.dataSource.icon ? (
          <Icon visual={item.dataSource.icon} size="md" />
        ) : null;
      }

      if (item.type === "project") {
        return <Icon visual={SpaceOpenIcon} size="md" />;
      }

      if (item.type === "person") {
        return (
          <Avatar
            name={item.user.fullName}
            visual={item.user.portrait}
            size="xs"
            isRounded={true}
          />
        );
      }

      return item.creator ? (
        <Avatar
          name={item.creator.fullName}
          visual={item.creator.portrait}
          size="xs"
          isRounded={true}
        />
      ) : (
        <Icon visual={ChatBubbleLeftRightIcon} size="md" />
      );
    };

    const getTitle = () => {
      if (item.type === "conversation" && item.creator) {
        return (
          <>
            <span className="s-shrink-0">{item.creator.fullName}</span>
            <span className="s-min-w-0 s-truncate s-text-muted-foreground dark:s-text-muted-foreground-night">
              {item.title}
            </span>
          </>
        );
      }
      return <span className="s-min-w-0 s-truncate">{item.title}</span>;
    };

    return (
      <UniversalSearchItem
        onClick={() => handleUniversalSearchSelect(item)}
        selected={selected}
        hasSeparator={false}
        visual={getVisual()}
        title={getTitle()}
        description={item.description}
      />
    );
  };

  // Calculate unread count for Inbox (same logic as InboxView)
  const unreadCount = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return allConversations.filter((conv) => {
      // Must have a spaceId
      if (!conv.spaceId) return false;
      // For demo: consider conversations updated in the last 2 days as "unread"
      return conv.updatedAt >= twoDaysAgo;
    }).length;
  }, [allConversations]);

  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) {
      return allConversations;
    }
    const lowerSearch = searchText.toLowerCase();
    return allConversations.filter((conv) =>
      conv.title.toLowerCase().includes(lowerSearch)
    );
  }, [searchText, allConversations]);

  const groupedConversations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);

    const groups = {
      today: [] as typeof filteredConversations,
      yesterday: [] as typeof filteredConversations,
      lastWeek: [] as typeof filteredConversations,
      lastMonth: [] as typeof filteredConversations,
    };

    filteredConversations.forEach((conv) => {
      const updatedAt = conv.updatedAt;
      if (updatedAt >= today) {
        groups.today.push(conv);
      } else if (updatedAt >= yesterday) {
        groups.yesterday.push(conv);
      } else if (updatedAt >= lastWeek) {
        groups.lastWeek.push(conv);
      } else if (updatedAt >= lastMonth) {
        groups.lastMonth.push(conv);
      }
    });

    return groups;
  }, [filteredConversations]);

  const filteredAgents = useMemo(() => {
    if (!agentSearchText.trim()) {
      return mockAgents;
    }
    const lowerSearch = agentSearchText.toLowerCase();
    return mockAgents.filter((agent) =>
      agent.name.toLowerCase().includes(lowerSearch)
    );
  }, [agentSearchText]);

  const filteredPeople = useMemo(() => {
    if (!peopleSearchText.trim()) {
      return mockUsers;
    }
    const lowerSearch = peopleSearchText.toLowerCase();
    return mockUsers.filter(
      (person) =>
        person.fullName.toLowerCase().includes(lowerSearch) ||
        person.email.toLowerCase().includes(lowerSearch)
    );
  }, [peopleSearchText]);

  const sortedCollaborators = useMemo(() => {
    return [...collaborators].sort((a, b) => {
      const nameA = a.type === "agent" ? a.data.name : a.data.fullName;
      const nameB = b.type === "agent" ? b.data.name : b.data.fullName;
      return nameA.localeCompare(nameB);
    });
  }, [collaborators]);

  const filteredCollaborators = useMemo(() => {
    if (!searchText.trim()) {
      return sortedCollaborators;
    }
    const lowerSearch = searchText.toLowerCase();
    return sortedCollaborators.filter((collaborator) => {
      if (collaborator.type === "agent") {
        const agent = collaborator.data;
        return (
          agent.name.toLowerCase().includes(lowerSearch) ||
          agent.description.toLowerCase().includes(lowerSearch)
        );
      } else {
        const person = collaborator.data;
        return (
          person.fullName.toLowerCase().includes(lowerSearch) ||
          person.email.toLowerCase().includes(lowerSearch)
        );
      }
    });
  }, [searchText, sortedCollaborators]);

  // Derive count and hasActivity deterministically from space ID.
  const getSpaceActivity = (space: Space) => {
    const charCode = space.id.charCodeAt(space.id.length - 1);
    const count = charCode % 3 === 0 ? (charCode % 9) + 1 : undefined;
    const hasActivity = count ? true : charCode % 2 !== 0;
    return { count, hasActivity };
  };

  const sortedSpaces = useMemo(() => {
    const sourceSpaces = searchText.trim() ? mockSpaces : spaces;
    return [...sourceSpaces].sort((a, b) => {
      const actA = getSpaceActivity(a);
      const actB = getSpaceActivity(b);

      // 1. Items with count come first, highest count first
      const countA = actA.count ?? 0;
      const countB = actB.count ?? 0;
      if (countA !== countB) {
        return countB - countA;
      }

      // 2. Items with hasActivity (but no count) come next
      if (actA.hasActivity !== actB.hasActivity) {
        return actA.hasActivity ? -1 : 1;
      }

      // 3. Alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }, [searchText, spaces]);

  const filteredSpaces = useMemo(() => {
    if (!searchText.trim()) {
      return sortedSpaces;
    }
    const lowerSearch = searchText.toLowerCase();
    return sortedSpaces.filter(
      (space) =>
        space.name.toLowerCase().includes(lowerSearch) ||
        space.description.toLowerCase().includes(lowerSearch)
    );
  }, [searchText, sortedSpaces]);

  const filteredProjects = useMemo(() => {
    const allSpaces = [...mockSpaces].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    if (!projectSearchText.trim()) {
      return allSpaces;
    }
    const lowerSearch = projectSearchText.toLowerCase();
    return allSpaces.filter(
      (space) =>
        space.name.toLowerCase().includes(lowerSearch) ||
        space.description.toLowerCase().includes(lowerSearch)
    );
  }, [projectSearchText]);

  // Find selected conversation from all conversations
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return (
      allConversations.find((c) => c.id === selectedConversationId) || null
    );
  }, [selectedConversationId, allConversations]);

  // Find selected space
  const selectedProject = useMemo(() => {
    if (!selectedSpaceId) return null;
    return mockSpaces.find((space) => space.id === selectedSpaceId) || null;
  }, [selectedSpaceId]);

  // Get conversations for selected space
  const spaceConversations = useMemo(() => {
    if (!selectedSpaceId) return [];
    return getConversationsBySpaceId(selectedSpaceId);
  }, [selectedSpaceId]);

  const getConversationMoreMenu = (conversation: Conversation) => {
    const participants = getRandomParticipants(conversation);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <NavigationListItemAction />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            label="Rename"
            icon={PencilSquareIcon}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              icon={ContactsUserIcon}
              label="Participant list"
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {participants.length > 0 ? (
                  participants.map((participant) => (
                    <DropdownMenuItem
                      key={
                        participant.type === "user"
                          ? `user-${participant.data.id}`
                          : `agent-${participant.data.id}`
                      }
                      label={
                        participant.type === "user"
                          ? participant.data.fullName
                          : participant.data.name
                      }
                      icon={
                        participant.type === "user" ? (
                          <Avatar
                            size="xxs"
                            name={participant.data.fullName}
                            visual={participant.data.portrait}
                            isRounded={true}
                          />
                        ) : (
                          <Avatar
                            size="xxs"
                            name={participant.data.name}
                            emoji={participant.data.emoji}
                            backgroundColor={participant.data.backgroundColor}
                            isRounded={false}
                          />
                        )
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    />
                  ))
                ) : (
                  <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground">
                    No participants
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem
            label="Delete"
            icon={TrashIcon}
            variant="warning"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (!user) {
    return (
      <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background">
        <div className="s-text-center">
          <p className="s-text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Sidebar content
  const sidebarContent = (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "chat" | "spaces" | "admin")
        }
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <div className="s-flex s-h-14 s-items-end s-border-b s-border-border s-px-2 dark:s-border-border-night">
          <TabsList border={false}>
            <TabsTrigger
              value="chat"
              label="Chat"
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger value="spaces" label="Spaces" icon={SpaceOpenIcon} />
            <TabsTrigger value="admin" icon={Cog6ToothIcon} />
          </TabsList>
        </div>
        <TabsContent
          value="chat"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            {/* Search Bar */}
            <div className="s-flex s-gap-1 s-p-2 s-px-2 s-items-center">
              <SearchInput
                name="conversation-search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Search"
                className="s-flex-1"
              />
              <Button
                variant="primary"
                tooltip="New Conversation"
                size="sm"
                icon={ChatBubbleBottomCenterTextIcon}
                label="New"
                onClick={handleNewConversation}
              />
              <DropdownMenu
                open={isAgentsDropdownOpen}
                onOpenChange={setIsAgentsDropdownOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={MoreIcon}
                    aria-label="More options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel label="Agents" />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      icon={PlusIcon}
                      label="Build an agent"
                    />
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        icon={PencilSquareIcon}
                        label="From scratch"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenuItem
                        icon={LightbulbIcon}
                        label="Browse templates"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsAgentsDropdownOpen(false);
                          setShowProfileView(false);
                          setSelectedView("templates");
                          setSelectedConversationId(null);
                          setSelectedSpaceId(null);
                          setPreviousSpaceId(null);
                          setCameFromInbox(false);
                        }}
                      />
                      <DropdownMenuItem
                        label="Open YAML"
                        icon={CodeSlashIcon}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    label="Edit agent"
                    icon={PencilSquareIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Manage agents"
                    icon={ContactsUserIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="Skills" />
                  <DropdownMenuItem
                    label="New skill"
                    icon={PlusIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Manage skills"
                    icon={PuzzleIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="Conversations" />
                  <DropdownMenuItem
                    label="Edit conversations"
                    icon={ListSelectIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Clear conversation history"
                    icon={TrashIcon}
                    variant="warning"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/* Collapsible Sections */}
            <NavigationList className="s-px-2">
              {!searchText.trim() && (
                <NavigationListItem
                  label="Inbox"
                  icon={InboxIcon}
                  selected={selectedView === "inbox"}
                  count={unreadCount > 0 ? unreadCount : undefined}
                  onClick={() => {
                    setShowProfileView(false);
                    setSelectedView("inbox");
                    setSelectedSpaceId(null);
                    setSelectedConversationId(null);
                    setPreviousSpaceId(null);
                    setCameFromInbox(false);
                  }}
                />
              )}
              {(filteredSpaces.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Projects"
                  type="collapse"
                  defaultOpen={true}
                  visibleItems={4}
                  showAllIcon={FullscreenIcon}
                  hideIcon={FullscreenExitIcon}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={PlusIcon}
                        variant="ghost"
                        aria-label="Agents options"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsCreateRoomDialogOpen(true);
                        }}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xmini"
                            icon={MoreIcon}
                            variant="ghost"
                            aria-label="Spaces options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <div className="s-flex s-gap-1.5 s-p-1.5">
                            <SearchInput
                              name="project-search"
                              value={projectSearchText}
                              onChange={setProjectSearchText}
                              placeholder="Search projects"
                              className="s-w-full"
                            />
                          </div>
                          <DropdownMenuSeparator />
                          {filteredProjects.length > 0 ? (
                            [...filteredProjects]
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((space) => (
                                <DropdownMenuItem
                                  key={space.id}
                                  label={space.name}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowProfileView(false);
                                    setSelectedSpaceId(space.id);
                                    setSelectedView("space");
                                    setSelectedConversationId(null);
                                    setPreviousSpaceId(null);
                                    setCameFromInbox(false);
                                  }}
                                />
                              ))
                          ) : (
                            <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground">
                              No projects found
                            </div>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {filteredSpaces.map((space) => {
                    // Deterministically assign open or restricted status based on space ID
                    const isRestricted =
                      space.id.charCodeAt(space.id.length - 1) % 2 === 0;
                    const { count, hasActivity } = getSpaceActivity(space);
                    return (
                      <NavigationListItem
                        key={space.id}
                        label={space.name}
                        icon={isRestricted ? SpaceOpenIcon : SpaceClosedIcon}
                        selected={space.id === selectedSpaceId}
                        count={count}
                        hasActivity={hasActivity}
                        moreMenu={
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <NavigationListItemAction />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                label="Edit"
                                icon={PencilSquareIcon}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              />
                              <DropdownMenuItem
                                label="Explore"
                                icon={MagnifyingGlassIcon}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        }
                        onClick={() => {
                          setShowProfileView(false);
                          setSelectedSpaceId(space.id);
                          setSelectedConversationId(null);
                          setSelectedView("space");
                          setCameFromInbox(false);
                        }}
                      />
                    );
                  })}
                </NavigationListCollapsibleSection>
              )}

              {(filteredConversations.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Conversations"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={ChatBubbleLeftRightIcon}
                        variant="ghost"
                        aria-label="New Conversation"
                        tooltip="New Conversation"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleNewConversation();
                        }}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xmini"
                            icon={MoreIcon}
                            variant="ghost"
                            aria-label="Conversations options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel label="Conversations" />
                          <DropdownMenuItem
                            label="Hide triggered"
                            icon={BoltOffIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Edit history"
                            icon={ListSelectIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Clear history"
                            variant="warning"
                            icon={TrashIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {groupedConversations.today.length > 0 && (
                    <>
                      {groupedConversations.today.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            setShowProfileView(false);
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                            setSelectedView("conversation");
                            setCameFromInbox(false);
                          }}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.yesterday.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Yesterday" isSticky />
                      {groupedConversations.yesterday.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            setShowProfileView(false);
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                            setSelectedView("conversation");
                            setCameFromInbox(false);
                          }}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.lastWeek.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Last week" isSticky />
                      {groupedConversations.lastWeek.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            setShowProfileView(false);
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                            setSelectedView("conversation");
                            setCameFromInbox(false);
                          }}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.lastMonth.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Last month" />
                      {groupedConversations.lastMonth.map((conversation) => (
                        <NavigationListItem
                          key={conversation.id}
                          label={conversation.title}
                          selected={conversation.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(conversation)}
                          onClick={() => {
                            setShowProfileView(false);
                            setPreviousSpaceId(null);
                            setSelectedConversationId(conversation.id);
                            setSelectedSpaceId(null);
                            setSelectedView("conversation");
                            setCameFromInbox(false);
                          }}
                        />
                      ))}
                    </>
                  )}
                </NavigationListCollapsibleSection>
              )}
            </NavigationList>
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="spaces"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <div className="s-flex s-flex-1 s-items-center s-justify-center s-text-muted-foreground">
            Spaces - TBD
          </div>
        </TabsContent>
        <TabsContent
          value="admin"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <div className="s-flex s-flex-1 s-items-center s-justify-center s-text-muted-foreground">
            Admin - TBD
          </div>
        </TabsContent>
      </Tabs>
      {/* Bottom Bar */}
      <div className="s-flex s-h-14 s-items-center s-justify-between s-gap-2 s-border-t s-border-border s-pl-1 s-pr-2 dark:s-border-border-night">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Card
              size="xs"
              onClick={(e) => e.preventDefault()}
              className="s-p-1"
              containerClassName="s-flex-1 s-min-w-0"
            >
              <div className="s-flex s-min-w-0 s-items-center s-gap-2 s-pr-1">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="sm"
                  isRounded={true}
                />
                <div className="s-flex s-min-w-0 s-grow s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
                  <span className="s-heading-sm s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
                    {user.fullName}
                  </span>
                  <span className="-s-mt-0.5 s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                    ACME
                  </span>
                </div>
              </div>
            </Card>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Profile"
              icon={UserIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowProfileView(true);
                setSelectedConversationId(null);
                setSelectedSpaceId(null);
              }}
            />
            <DropdownMenuItem
              label="Administration"
              icon={Cog6ToothIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={HeartIcon} label="Help & Support" />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel label="Learn about Dust" />
                  <DropdownMenuItem
                    label="Quickstart Guide"
                    icon={LightbulbIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Guides & Documentation"
                    icon={BookOpenIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Join the Slack Community"
                    icon={SlackLogo}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuLabel label="Ask questions" />
                  <DropdownMenuItem
                    label="Ask @help"
                    description="Ask anything about Dust"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="How to invite new users?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="How to use agents in Slack workflow?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="How to manage billing?"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              label="Signout"
              icon={LogoutIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost-secondary"
          size="mini"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
        />
      </div>
    </div>
  );

  // Handle back button from conversation view
  const handleConversationBack = () => {
    setShowProfileView(false);
    if (previousSpaceId) {
      setSelectedSpaceId(previousSpaceId);
      setSelectedConversationId(null);
      setSelectedView("space");
      setCameFromInbox(false);
      // Optionally clear previousSpaceId, or keep it for future navigation
      // setPreviousSpaceId(null);
    } else if (cameFromInbox) {
      // Return to inbox if we came from there
      setSelectedView("inbox");
      setSelectedConversationId(null);
      setCameFromInbox(false);
    }
  };

  function handleNewConversation() {
    setShowProfileView(false);
    setSelectedConversationId("new-conversation");
    setSelectedView(null);
    setSelectedSpaceId(null);
    setPreviousSpaceId(null);
    setCameFromInbox(false);
  }

  // Handle room creation flow
  const handleRoomNameNext = (name: string, isPublic: boolean) => {
    // Create the new space directly
    const newSpace = createSpace(name, undefined, isPublic);

    // Update spaces state
    setSpaces((prev) => [...prev, newSpace]);

    // Store the public setting
    setSpacePublicSettings((prev) => {
      const newMap = new Map(prev);
      newMap.set(newSpace.id, isPublic);
      return newMap;
    });

    // Track the newly created space ID for auto-selection
    setLastCreatedSpaceId(newSpace.id);

    // Close dialog
    setIsCreateRoomDialogOpen(false);
  };

  // Handle invite members for a space
  const handleInviteMembers = (spaceId: string) => {
    setInviteSpaceId(spaceId);
    setIsInviteUsersScreenOpen(true);
  };

  const handleInviteUsersComplete = (
    selectedUserIds: string[],
    editorUserIds: string[]
  ) => {
    // Store invited members for the space
    if (inviteSpaceId) {
      setSpaceMembers((prev) => {
        const newMap = new Map(prev);
        newMap.set(inviteSpaceId, selectedUserIds);
        return newMap;
      });
      setSpaceEditors((prev) => {
        const newMap = new Map(prev);
        newMap.set(inviteSpaceId, editorUserIds);
        return newMap;
      });
    }
    // Close the invite dialog
    setIsInviteUsersScreenOpen(false);
    setInviteSpaceId(null);
  };

  // Handle space name update
  const handleUpdateSpaceName = (spaceId: string, newName: string) => {
    // For prototype, just log the update
    // In a real implementation, this would update the space in the backend
    setSpaces((prev) =>
      prev.map((space) =>
        space.id === spaceId ? { ...space, name: newName } : space
      )
    );
  };

  // Handle space public setting update
  const handleUpdateSpacePublic = (spaceId: string, isPublic: boolean) => {
    // Update the public setting state
    setSpacePublicSettings((prev) => {
      const newMap = new Map(prev);
      newMap.set(spaceId, isPublic);
      return newMap;
    });
    // Also update the space object
    setSpaces((prev) =>
      prev.map((space) =>
        space.id === spaceId ? { ...space, isPublic } : space
      )
    );
    // For prototype, just log the update
  };

  // Main content
  const mainContent =
    // Priority 0: Show profile when opened from user menu
    showProfileView && user ? (
      <ProfilePanel user={user} />
    ) : // Priority 1: Show conversation view if a conversation is selected (not "new-conversation")
    selectedConversationId &&
      selectedConversationId !== "new-conversation" &&
      selectedConversation &&
      user ? (
      <ConversationView
        conversation={selectedConversation}
        locutor={user}
        users={mockUsers}
        agents={mockAgents}
        conversationsWithMessages={conversationsWithMessages}
        showBackButton={!!previousSpaceId || cameFromInbox}
        onBack={handleConversationBack}
        projectTitle={previousSpaceId ? selectedProject?.name : undefined}
      />
    ) : // Priority 2: Show inbox view if inbox is selected
    selectedView === "inbox" ? (
      <InboxView
        spaces={spaces}
        conversations={allConversations}
        users={mockUsers}
        agents={mockAgents}
        onConversationClick={(conversation) => {
          setShowProfileView(false);
          setPreviousSpaceId(null);
          setSelectedView("conversation");
          setSelectedConversationId(conversation.id);
          setCameFromInbox(true);
        }}
        onSpaceClick={(space) => {
          setShowProfileView(false);
          setSelectedSpaceId(space.id);
          setSelectedView("space");
          setSelectedConversationId(null);
          setCameFromInbox(false);
        }}
      />
    ) : // Priority 3: Show template selection when Browse templates is clicked
    selectedView === "templates" ? (
      <div className="s-h-full s-overflow-auto">
        <TemplateSelection
          onTemplateClick={(t) => setSelectedTemplateForBuilder(t)}
        />
      </div>
    ) : // Priority 4: Show space view if a space is selected
    selectedProject && selectedSpaceId ? (
      <GroupConversationView
        space={selectedProject}
        conversations={spaceConversations}
        users={mockUsers}
        agents={mockAgents}
        isProjectJoined={isProjectJoined(selectedSpaceId)}
        onJoinProject={() => joinProject(selectedProject)}
        onLeaveProject={() => leaveProject(selectedSpaceId)}
        spaceMemberIds={
          spaceMembers.has(selectedSpaceId)
            ? spaceMembers.get(selectedSpaceId)!
            : getMembersBySpaceId(selectedSpaceId)
        }
        editorUserIds={
          spaceEditors.has(selectedSpaceId)
            ? spaceEditors.get(selectedSpaceId)!
            : []
        }
        onConversationClick={(conversation) => {
          setShowProfileView(false);
          setPreviousSpaceId(selectedSpaceId);
          setSelectedView("conversation");
          setSelectedConversationId(conversation.id);
          setCameFromInbox(false);
        }}
        onInviteMembers={() => handleInviteMembers(selectedSpaceId)}
        onUpdateSpaceName={handleUpdateSpaceName}
        onUpdateSpacePublic={handleUpdateSpacePublic}
        spacePublicSettings={spacePublicSettings}
      />
    ) : (
      // Priority 5: Show welcome/new conversation view
      <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 s-px-4 s-py-8">
          <div className="s-heading-2xl s-text-foreground">
            Welcome, Edouard!{" "}
          </div>
          <InputBar placeholder="Ask a question" />
          <div className="s-flex s-w-full s-flex-col s-gap-2">
            <div className="s-heading-lg s-text-foreground">
              Universal search
            </div>
            <SearchInputWithPopover
              name="document-search"
              value={universalSearchText}
              stickyTopContent={
                <>
                  <Button size="xs" label="All" variant={"primary"} />
                  <Button size="xs" label="Projects" variant={"ghost"} />
                  <Button size="xs" label="Conversations" variant={"ghost"} />
                  <Button size="xs" label="People" variant={"ghost"} />
                  <Button size="xs" label="Documents" variant={"ghost"} />
                  <div className="s-w-full s-flex-1" />
                  <Button
                    size="xs"
                    icon={MagnifyingGlassIcon}
                    label="Ask @dust"
                    variant={"outline"}
                  />
                  <Button
                    size="xs"
                    icon={AtomIcon}
                    label="Start a DeepDive"
                    variant={"highlight"}
                  />
                </>
              }
              stickyBottomContent={
                <div className="s-heading-sm s-flex s-items-center s-gap-3 s-px-1.5 s-py-1 s-text-muted-foreground">
                  <Spinner size="sm" />
                  Searching some more...
                </div>
              }
              onChange={(value) => {
                setUniversalSearchText(value);
                if (!value.trim()) {
                  setIsUniversalSearchOpen(false);
                }
              }}
              open={isUniversalSearchOpen}
              onOpenChange={setIsUniversalSearchOpen}
              placeholder="Find company documents, Agents, People…"
              className="s-w-full"
              items={universalSearchResults}
              availableHeight
              noResults={
                universalSearchText.trim()
                  ? "No results found"
                  : "Start typing to search"
              }
              onItemSelect={handleUniversalSearchSelect}
              renderItem={(item, selected) => (
                <UniversalSearchResultItem item={item} selected={selected} />
              )}
            />
          </div>
          <div className="s-heading-lg s-text-foreground">Chat with…</div>
        </div>
      </div>
    );

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background">
      <SidebarLayout
        ref={sidebarLayoutRef}
        sidebar={sidebarContent}
        content={mainContent}
        defaultSidebarWidth={280}
        minSidebarWidth={200}
        maxSidebarWidth={400}
        collapsible={true}
        onSidebarToggle={setIsSidebarCollapsed}
      />
      <CreateRoomDialog
        isOpen={isCreateRoomDialogOpen}
        onClose={() => {
          setIsCreateRoomDialogOpen(false);
        }}
        onNext={handleRoomNameNext}
      />
      <Dialog
        open={selectedTemplateForBuilder !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTemplateForBuilder(null);
        }}
      >
        <DialogContent
          size="full"
          className="s-flex s-h-full s-max-h-full s-rounded-none s-p-0 s-overflow-hidden"
        >
          {selectedTemplateForBuilder && (
            <AgentBuilderView
              template={{
                handle: selectedTemplateForBuilder.handle,
                emoji: selectedTemplateForBuilder.emoji,
                backgroundColor: selectedTemplateForBuilder.backgroundColor,
              }}
              onClose={() => setSelectedTemplateForBuilder(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <InviteUsersScreen
        isOpen={isInviteUsersScreenOpen}
        spaceId={inviteSpaceId}
        onClose={() => {
          setIsInviteUsersScreenOpen(false);
          setInviteSpaceId(null);
        }}
        onInvite={handleInviteUsersComplete}
        actionLabel="Save"
        initialSelectedUserIds={
          inviteSpaceId && spaceMembers.has(inviteSpaceId)
            ? spaceMembers.get(inviteSpaceId)
            : []
        }
        initialEditorUserIds={
          inviteSpaceId && spaceEditors.has(inviteSpaceId)
            ? spaceEditors.get(inviteSpaceId)
            : []
        }
        hasMultipleSelect={true}
      />
      <Sheet
        open={isDocumentSheetOpen}
        onOpenChange={(open: boolean) => {
          setIsDocumentSheetOpen(open);
          if (!open) {
            setSelectedDataSource(null);
          }
        }}
      >
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>
              {selectedDataSource?.fileName || "Document View"}
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                Document View
              </p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default DustMain;
