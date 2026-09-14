import {
  Archive,
  Avatar,
  Bell01,
  Brackets,
  Breadcrumbs,
  Button,
  CheckCircle,
  CheckDone01,
  ChevronDown,
  ContactsRobot,
  Cube01,
  CubeOutline,
  Dialog,
  DialogContent,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Edit04,
  Eye,
  File02,
  FolderOpen,
  Heart,
  Icon,
  Mail01,
  IntersectDust,
  Lightbulb04,
  Link01,
  LogOut01,
  MagicWand02,
  MessageChatSquare,
  MessageCircle01,
  MessagePlusCircle,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Planet,
  Plus,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  PuzzlePiece01,
  Robot,
  ScrollArea,
  ScrollBar,
  SearchInput,
  Settings01,
  SlackLogo,
  Star01,
  Trash01,
  User01,
  Users01,
  UserSquare,
  XClose,
  Zap,
  ZapOff,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";

import { AgentBuilderView } from "../components/AgentBuilderView";
import {
  ConversationActions,
  isFileView,
  type SidePanelView,
  sidePanelContent,
  sidePanelLabel,
  sidePanelSizing,
} from "../components/ConversationSidePanels";
import { ConversationView } from "../components/ConversationView";
import { CreateRoomDialog } from "../components/CreateRoomDialog";
import { GroupConversationView } from "../components/GroupConversationView";
import { InboxView } from "../components/InboxView";
import { InviteUsersScreen } from "../components/InviteUsersScreen";
import { PersonAgentView } from "../components/PersonAgentView";
import {
  type AgentSort,
  type AgentType,
  NewConversation,
  NewConversationActionBar,
  type WelcomeAgentTab,
} from "../components/NewConversation";
import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
  type PanelSizingType,
} from "../components/PanelLayout";
import { ProfilePanel } from "../components/Profile";
import {
  type Agent,
  type Conversation,
  createConversationsWithMessages,
  createSpace,
  getAgentById,
  getMembersBySpaceId,
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  getUserById,
  isTriggeredConversation,
  mockAgents,
  mockConversations,
  mockUsers,
  MY_POD_SPACE,
  type Space,
  type User,
} from "../data";
import {
  getDataSourceIcon,
  getDataSourcesBySpaceId,
} from "../data/dataSources";
import { getRandomGreetingForName } from "../data/greetings";
import {
  buildPodTabOptions,
  type DynamicFileTab,
  getDefaultMainTabOrder,
  getFileTabIcon,
  getFileTabValue,
  type PodTabOption,
  reorderFileTabsInOrder,
  resolvePodContext,
  shouldShowMemberChrome,
} from "./podPanelConfig";
import TemplateSelection, { type Template } from "./TemplateSelection";

// ── Types ─────────────────────────────────────────────────────────────────────

type Collaborator =
  | { type: "agent"; data: Agent }
  | { type: "person"; data: User };

type SpaceNotificationPreference = "never" | "mentions" | "all";

type PodTabsState = {
  mainTabOrder: string[];
  dynamicFileTabs: DynamicFileTab[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRandomParticipants(conversation: Conversation) {
  const all = [
    ...conversation.userParticipants.map((id) => ({
      type: "user" as const,
      data: getUserById(id),
    })),
    ...conversation.agentParticipants.map((id) => ({
      type: "agent" as const,
      data: getAgentById(id),
    })),
  ].filter((p) => p.data != null) as (
    | { type: "user"; data: User }
    | { type: "agent"; data: Agent }
  )[];
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(
    0,
    Math.min(Math.max(1, Math.floor(Math.random() * 6) + 1), shuffled.length)
  );
}

function getSpaceActivity(space: Space) {
  const c = space.id.charCodeAt(space.id.length - 1);
  const count = c % 3 === 0 ? (c % 9) + 1 : undefined;
  return { count, hasActivity: count ? true : c % 2 !== 0 };
}

function collaboratorName(collaborator: Collaborator) {
  return collaborator.type === "agent"
    ? collaborator.data.name
    : collaborator.data.fullName;
}

function collaboratorAvatarProps(collaborator: Collaborator) {
  if (collaborator.type === "agent") {
    return {
      name: collaborator.data.name,
      emoji: collaborator.data.emoji,
      backgroundColor: collaborator.data.backgroundColor,
      isRounded: false,
    };
  }
  return {
    name: collaborator.data.fullName,
    visual: collaborator.data.portrait,
    isRounded: true,
  };
}

function getCollaboratorConversations(
  allConversations: Conversation[],
  userId: string,
  collaborator: Collaborator
): Conversation[] {
  const id = collaborator.data.id;
  const existing = allConversations.filter((conv) => {
    if (!conv.userParticipants.includes(userId)) {
      return false;
    }
    if (collaborator.type === "agent") {
      return conv.agentParticipants.includes(id);
    }
    return conv.userParticipants.includes(id);
  });
  if (existing.length > 0) {
    return existing;
  }

  const titles = [
    "Quick question",
    "Follow-up discussion",
    "Project update",
    "Weekly sync",
    "Planning session",
  ];
  const seed = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const count = (seed % 4) + 3;
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = ((seed + i * 7) % 35) + 1;
    const updatedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const title = titles[(seed + i) % titles.length];
    return {
      id: `generated-conv-${id}-${i}`,
      title,
      createdAt: new Date(updatedAt.getTime() - 2 * 24 * 60 * 60 * 1000),
      updatedAt,
      userParticipants:
        collaborator.type === "person" ? [userId, id] : [userId],
      agentParticipants: collaborator.type === "agent" ? [id] : [],
      description: `Conversation about ${title.toLowerCase()}`,
    };
  });
}

// ── Main component ────────────────────────────────────────────────────────────

function PeopleAgent() {
  // ── Bootstrap state ───────────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    if (user) {
      setGreeting(getRandomGreetingForName(user.firstName));
    }
  }, [user]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    Conversation[]
  >([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  useEffect(() => {
    const u = getRandomUsers(1)[0];
    setUser(u);
    const agentCount = Math.floor(Math.random() * 5) + 1;
    const peopleCount = Math.floor(Math.random() * 5) + 1;
    setCollaborators([
      ...getRandomAgents(agentCount).map((d) => ({
        type: "agent" as const,
        data: d,
      })),
      ...getRandomUsers(peopleCount + 1)
        .filter((person) => person.id !== u.id)
        .slice(0, peopleCount)
        .map((d) => ({
          type: "person" as const,
          data: d,
        })),
    ]);
    const randomSpaces = getRandomSpaces(Math.floor(Math.random() * 7) + 3);
    setSpaces(randomSpaces);
    setStarredSpaceIds(
      new Set(randomSpaces.slice(0, 2).map((space) => space.id))
    );
    setConversationsWithMessages(createConversationsWithMessages(u.id));
  }, []);

  // ── Navigation state ──────────────────────────────────────────────────────
  // P2 selection: what's shown in the "level 1" panel
  type P2View =
    | { kind: "welcome" }
    | { kind: "inbox" }
    | { kind: "conversations" }
    | { kind: "automations" }
    | { kind: "conversation"; conversationId: string }
    | { kind: "space"; spaceId: string }
    | { kind: "agent"; agentId: string }
    | { kind: "person"; personId: string }
    | { kind: "profile" }
    | { kind: "templates" };

  const [p2View, setP2View] = useState<P2View>({ kind: "inbox" });

  // P3: conversation from a space (level 2), or a side panel opened from the
  // level-1 conversation (citation preview, file, files, credit usage).
  type P3View =
    | { kind: "conversation"; conversationId: string }
    | SidePanelView;

  const [p3View, setP3View] = useState<P3View | null>(null);

  // P4: side panel opened from a level-2 conversation.
  const [p4View, setP4View] = useState<SidePanelView | null>(null);

  // ── Space panel tab state (lifted from GroupConversationView) ────────────
  const [spaceActiveTab, setSpaceActiveTab] = useState("conversations");
  const [inboxActiveTab, setInboxActiveTab] = useState<
    "conversations" | "tasks"
  >("conversations");
  const [podTabsBySpaceId, setPodTabsBySpaceId] = useState<
    Map<string, PodTabsState>
  >(new Map());
  const [draggingPodFileId, setDraggingPodFileId] = useState<string | null>(
    null
  );
  const [fileToRevealInKnowledge, setFileToRevealInKnowledge] = useState<
    string | null
  >(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    value: string;
    x: number;
    y: number;
  } | null>(null);

  // ── Sidebar UI state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [agentSearchText, setAgentSearchText] = useState("");
  const [peopleSearchText, setPeopleSearchText] = useState("");
  const [isCollaboratorAboutOpen, setIsCollaboratorAboutOpen] = useState(false);
  const [welcomeAgentTab, setWelcomeAgentTab] =
    useState<WelcomeAgentTab>("favorites");
  const [welcomeAgentSort, setWelcomeAgentSort] = useState<AgentSort>("custom");
  const [welcomeAgentType, setWelcomeAgentType] = useState<AgentType>("all");
  const [welcomeAgentCategory, setWelcomeAgentCategory] = useState<
    string | null
  >(null);
  const [isWelcomeToolbarPinned, setIsWelcomeToolbarPinned] = useState(false);
  const [spaceNotificationPreferences, setSpaceNotificationPreferences] =
    useState<Map<string, SpaceNotificationPreference>>(new Map());
  const [starredSpaceIds, setStarredSpaceIds] = useState<Set<string>>(
    new Set()
  );
  const [hideTriggeredConversations, setHideTriggeredConversations] =
    useState(false);

  // ── Space management state ────────────────────────────────────────────────
  const [spaceMembers, setSpaceMembers] = useState<Map<string, string[]>>(
    new Map()
  );
  const [spaceEditors, setSpaceEditors] = useState<Map<string, string[]>>(
    new Map()
  );
  const [spacePublicSettings, setSpacePublicSettings] = useState<
    Map<string, boolean>
  >(new Map());
  const [isCreateRoomDialogOpen, setIsCreateRoomDialogOpen] = useState(false);
  const [isInviteUsersScreenOpen, setIsInviteUsersScreenOpen] = useState(false);
  const [inviteSpaceId, setInviteSpaceId] = useState<string | null>(null);
  const [lastCreatedSpaceId, setLastCreatedSpaceId] = useState<string | null>(
    null
  );

  // ── Agent builder ─────────────────────────────────────────────────────────
  const [selectedTemplateForBuilder, setSelectedTemplateForBuilder] =
    useState<Template | null>(null);

  // Auto-initialize space members
  useEffect(() => {
    const spaceId = p2View.kind === "space" ? p2View.spaceId : null;
    if (spaceId && !spaceMembers.has(spaceId)) {
      setSpaceMembers((prev) =>
        new Map(prev).set(spaceId, getMembersBySpaceId(spaceId))
      );
    }
  }, [p2View, spaceMembers]);

  // Auto-select newly created space
  useEffect(() => {
    if (lastCreatedSpaceId && spaces.find((s) => s.id === lastCreatedSpaceId)) {
      setP2View({ kind: "space", spaceId: lastCreatedSpaceId });
      setP3View(null);
      setLastCreatedSpaceId(null);
    }
  }, [spaces, lastCreatedSpaceId]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const allConversations = useMemo(
    () => [...conversationsWithMessages, ...mockConversations],
    [conversationsWithMessages]
  );

  const unreadCount = useMemo(() => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    return allConversations.filter((conv) => {
      if (!conv.spaceId) return false;
      return conv.updatedAt >= twoDaysAgo;
    }).length;
  }, [allConversations]);

  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) return allConversations;
    const lower = searchText.toLowerCase();
    return allConversations.filter((c) =>
      c.title.toLowerCase().includes(lower)
    );
  }, [searchText, allConversations]);

  const recentConversations = useMemo(() => {
    return [...filteredConversations]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 30);
  }, [filteredConversations]);

  const sortedSpaces = useMemo(() => {
    return [...spaces].sort((a, b) => {
      const { count: cA = 0, hasActivity: hA } = getSpaceActivity(a);
      const { count: cB = 0, hasActivity: hB } = getSpaceActivity(b);
      if (cA !== cB) return cB - cA;
      if (hA !== hB) return hA ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [spaces]);

  const filteredSpaces = useMemo(() => {
    if (!searchText.trim()) return sortedSpaces;
    const lower = searchText.toLowerCase();
    return sortedSpaces.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower)
    );
  }, [searchText, sortedSpaces]);

  const starredSpaces = useMemo(
    () => filteredSpaces.filter((s) => starredSpaceIds.has(s.id)),
    [filteredSpaces, starredSpaceIds]
  );

  const unstarredSpaces = useMemo(
    () => filteredSpaces.filter((s) => !starredSpaceIds.has(s.id)),
    [filteredSpaces, starredSpaceIds]
  );

  const [podBrowseSearch, setPodBrowseSearch] = useState("");
  const browsableSpaces = useMemo(() => {
    if (!podBrowseSearch.trim()) {
      return sortedSpaces;
    }
    const lower = podBrowseSearch.toLowerCase();
    return sortedSpaces.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower)
    );
  }, [podBrowseSearch, sortedSpaces]);

  const selectedConversationId =
    p2View.kind === "conversation" ? p2View.conversationId : null;

  const selectedConversation = useMemo(
    () =>
      selectedConversationId
        ? (allConversations.find((c) => c.id === selectedConversationId) ??
          null)
        : null,
    [selectedConversationId, allConversations]
  );
  const p3Conversation = useMemo(
    () =>
      p3View?.kind === "conversation"
        ? (allConversations.find((c) => c.id === p3View.conversationId) ?? null)
        : null,
    [p3View, allConversations]
  );

  const sortedCollaborators = useMemo(() => {
    return [...collaborators].sort((a, b) =>
      collaboratorName(a).localeCompare(collaboratorName(b))
    );
  }, [collaborators]);

  const filteredCollaborators = useMemo(() => {
    if (!searchText.trim()) {
      return sortedCollaborators;
    }
    const lower = searchText.toLowerCase();
    return sortedCollaborators.filter((collaborator) => {
      if (collaborator.type === "agent") {
        return (
          collaborator.data.name.toLowerCase().includes(lower) ||
          collaborator.data.description.toLowerCase().includes(lower)
        );
      }
      return (
        collaborator.data.fullName.toLowerCase().includes(lower) ||
        collaborator.data.email.toLowerCase().includes(lower)
      );
    });
  }, [searchText, sortedCollaborators]);

  const filteredAgents = useMemo(() => {
    if (!agentSearchText.trim()) {
      return mockAgents;
    }
    const lower = agentSearchText.toLowerCase();
    return mockAgents.filter((agent) =>
      agent.name.toLowerCase().includes(lower)
    );
  }, [agentSearchText]);

  const filteredPeople = useMemo(() => {
    const candidates = user
      ? mockUsers.filter((person) => person.id !== user.id)
      : mockUsers;
    if (!peopleSearchText.trim()) {
      return candidates;
    }
    const lower = peopleSearchText.toLowerCase();
    return candidates.filter(
      (person) =>
        person.fullName.toLowerCase().includes(lower) ||
        person.email.toLowerCase().includes(lower)
    );
  }, [peopleSearchText, user]);

  const selectedCollaborator = useMemo((): Collaborator | null => {
    if (p2View.kind === "agent") {
      const fromList = collaborators.find(
        (c) => c.type === "agent" && c.data.id === p2View.agentId
      );
      if (fromList) {
        return fromList;
      }
      const agent = getAgentById(p2View.agentId);
      return agent ? { type: "agent", data: agent } : null;
    }
    if (p2View.kind === "person") {
      const fromList = collaborators.find(
        (c) => c.type === "person" && c.data.id === p2View.personId
      );
      if (fromList) {
        return fromList;
      }
      const person = getUserById(p2View.personId);
      return person ? { type: "person", data: person } : null;
    }
    return null;
  }, [p2View, collaborators]);

  const collaboratorConversations = useMemo(() => {
    if (!selectedCollaborator || !user) {
      return [];
    }
    return getCollaboratorConversations(
      allConversations,
      user.id,
      selectedCollaborator
    );
  }, [selectedCollaborator, user, allConversations]);

  // ── Pod context & tab state ───────────────────────────────────────────────
  const podContext = useMemo(
    () => resolvePodContext(p2View, spaces, allConversations),
    [p2View, spaces, allConversations]
  );

  const activePodTab = spaceActiveTab;
  const setActivePodTab = setSpaceActiveTab;

  const currentPodTabsState = useMemo((): PodTabsState | null => {
    if (!podContext) {
      return null;
    }

    return (
      podTabsBySpaceId.get(podContext.spaceId) ?? {
        mainTabOrder: getDefaultMainTabOrder(podContext.variant),
        dynamicFileTabs: [],
      }
    );
  }, [podContext, podTabsBySpaceId]);

  const getFallbackFileTabIcon = useCallback(
    (dataSourceId: string): ComponentType => {
      if (!podContext) {
        return File02;
      }

      const file = getDataSourcesBySpaceId(podContext.spaceId).find(
        (item) => item.id === dataSourceId
      );
      if (!file) {
        return File02;
      }

      return getDataSourceIcon(file) ?? File02;
    },
    [podContext]
  );

  const basePodTabOptions = useMemo((): PodTabOption[] => {
    if (!podContext || !currentPodTabsState) {
      return [];
    }

    return buildPodTabOptions(
      podContext.variant,
      currentPodTabsState.mainTabOrder,
      currentPodTabsState.dynamicFileTabs,
      getFallbackFileTabIcon
    );
  }, [podContext, currentPodTabsState, getFallbackFileTabIcon]);

  const dynamicFileTabIds = useMemo(
    () =>
      currentPodTabsState?.dynamicFileTabs.map((tab) => tab.dataSourceId) ?? [],
    [currentPodTabsState]
  );

  useEffect(() => {
    if (!podContext) {
      return;
    }

    setPodTabsBySpaceId((prev) => {
      if (prev.has(podContext.spaceId)) {
        return prev;
      }

      return new Map(prev).set(podContext.spaceId, {
        mainTabOrder: getDefaultMainTabOrder(podContext.variant),
        dynamicFileTabs: [],
      });
    });
  }, [podContext]);

  const handlePodFileDrop = useCallback(
    (
      fileId: string,
      options?: { activateTab?: boolean; iconName?: string }
    ) => {
      if (!podContext) {
        return;
      }

      const file = getDataSourcesBySpaceId(podContext.spaceId).find(
        (dataSource) => dataSource.id === fileId
      );
      if (!file || file.kind === "folder") {
        return;
      }

      const fileTabValue = getFileTabValue(fileId);

      setPodTabsBySpaceId((prev) => {
        const existing = prev.get(podContext.spaceId) ?? {
          mainTabOrder: getDefaultMainTabOrder(podContext.variant),
          dynamicFileTabs: [],
        };
        const alreadyOpen = existing.dynamicFileTabs.some(
          (tab) => tab.dataSourceId === fileId
        );
        const dynamicFileTabs = alreadyOpen
          ? existing.dynamicFileTabs
          : [
              ...existing.dynamicFileTabs,
              {
                value: fileTabValue,
                dataSourceId: fileId,
                label: file.fileName,
                ...(options?.iconName ? { iconName: options.iconName } : {}),
              },
            ];
        const mainTabOrder = alreadyOpen
          ? existing.mainTabOrder
          : [...existing.mainTabOrder, fileTabValue];

        return new Map(prev).set(podContext.spaceId, {
          mainTabOrder,
          dynamicFileTabs,
        });
      });
      if (options?.activateTab !== false) {
        setActivePodTab(fileTabValue);
      }
      setDraggingPodFileId(null);
    },
    [podContext, setActivePodTab]
  );

  const handlePodFileDragChange = useCallback((fileId: string | null) => {
    setDraggingPodFileId(fileId);
  }, []);

  const handlePodRemoveTab = useCallback(
    (tabValue: string) => {
      if (!podContext || !tabValue.startsWith("file-")) {
        return;
      }

      setPodTabsBySpaceId((prev) => {
        const existing = prev.get(podContext.spaceId);
        if (!existing) {
          return prev;
        }

        return new Map(prev).set(podContext.spaceId, {
          mainTabOrder: existing.mainTabOrder.filter(
            (value) => value !== tabValue
          ),
          dynamicFileTabs: existing.dynamicFileTabs.filter(
            (tab) => tab.value !== tabValue
          ),
        });
      });

      if (activePodTab === tabValue) {
        setActivePodTab("conversations");
      }
    },
    [activePodTab, podContext, setActivePodTab]
  );

  const handlePodFileReorder = useCallback(
    (draggedValue: string, targetValue: string) => {
      if (!podContext) {
        return;
      }

      setPodTabsBySpaceId((prev) => {
        const existing = prev.get(podContext.spaceId);
        if (!existing) {
          return prev;
        }

        const nextMainTabOrder = reorderFileTabsInOrder(
          existing.mainTabOrder,
          draggedValue,
          targetValue
        );
        if (nextMainTabOrder === existing.mainTabOrder) {
          return prev;
        }

        const tabsByValue = new Map<string, DynamicFileTab>(
          existing.dynamicFileTabs.map((tab) => [tab.value, tab])
        );
        const dynamicFileTabs = nextMainTabOrder.flatMap((value) => {
          const tab = tabsByValue.get(value);
          return tab ? [tab] : [];
        });

        return new Map(prev).set(podContext.spaceId, {
          mainTabOrder: nextMainTabOrder,
          dynamicFileTabs,
        });
      });
    },
    [podContext]
  );

  const handlePodTabIconChange = useCallback(
    (tabValue: string, iconName: string) => {
      if (!podContext) {
        return;
      }

      setPodTabsBySpaceId((prev) => {
        const existing = prev.get(podContext.spaceId);
        if (!existing) {
          return prev;
        }

        return new Map(prev).set(podContext.spaceId, {
          ...existing,
          dynamicFileTabs: existing.dynamicFileTabs.map((tab) =>
            tab.value === tabValue ? { ...tab, iconName } : tab
          ),
        });
      });
    },
    [podContext]
  );

  const handleShowFileInFiles = useCallback(
    (tabValue: string) => {
      if (!tabValue.startsWith("file-")) {
        return;
      }

      setActivePodTab("knowledge");
      setFileToRevealInKnowledge(tabValue.slice("file-".length));
    },
    [setActivePodTab]
  );

  const podTabOptions = useMemo((): PodTabOption[] => {
    return basePodTabOptions.map((option) => {
      if (!option.value.startsWith("file-")) {
        return option;
      }

      return {
        ...option,
        contextMenuItems: [
          {
            label: "Start a conversation with document",
            icon: MessageCircle01,
          },
          {
            label: "Show in files",
            icon: Eye,
            onClick: () => handleShowFileInFiles(option.value),
          },
          {
            label: "Remove from topbar",
            icon: XClose,
            variant: "warning",
            onClick: () => handlePodRemoveTab(option.value),
          },
        ],
      };
    });
  }, [basePodTabOptions, handlePodRemoveTab, handleShowFileInFiles]);

  const addablePodFiles = useMemo(() => {
    if (!podContext) {
      return [];
    }

    const pinnedIds = new Set(dynamicFileTabIds);
    return getDataSourcesBySpaceId(podContext.spaceId).filter(
      (item) => item.kind === "file" && !pinnedIds.has(item.id)
    );
  }, [dynamicFileTabIds, podContext]);

  const podTabCustomizationTabs = useMemo(() => {
    if (!currentPodTabsState) {
      return [];
    }

    const tabsByValue = new Map<string, DynamicFileTab>(
      currentPodTabsState.dynamicFileTabs.map((tab) => [tab.value, tab])
    );

    return currentPodTabsState.mainTabOrder.flatMap((value) => {
      const tab = tabsByValue.get(value);
      if (!tab) {
        return [];
      }

      return [
        {
          value: tab.value,
          label: tab.label,
          icon: getFileTabIcon(
            tab.iconName,
            getFallbackFileTabIcon(tab.dataSourceId)
          ),
          iconName: tab.iconName,
        },
      ];
    });
  }, [currentPodTabsState, getFallbackFileTabIcon]);

  const tabContextMenuOption = tabContextMenu
    ? podTabOptions.find((option) => option.value === tabContextMenu.value)
    : undefined;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openCreateAgent = () => {
    setP2View({ kind: "templates" });
    setP3View(null);
    setP4View(null);
  };

  const selectCollaborator = (type: Collaborator["type"], id: string) => {
    setP2View(
      type === "agent"
        ? { kind: "agent", agentId: id }
        : { kind: "person", personId: id }
    );
    setP3View(null);
    setP4View(null);
    setIsCollaboratorAboutOpen(false);
  };

  const addCollaborator = (next: Collaborator) => {
    setCollaborators((prev) => {
      if (
        prev.some((c) => c.type === next.type && c.data.id === next.data.id)
      ) {
        return prev;
      }
      return [...prev, next];
    });
  };

  const removeCollaborator = (type: Collaborator["type"], id: string) => {
    setCollaborators((prev) =>
      prev.filter((c) => !(c.type === type && c.data.id === id))
    );
    if (
      (p2View.kind === "agent" && type === "agent" && p2View.agentId === id) ||
      (p2View.kind === "person" && type === "person" && p2View.personId === id)
    ) {
      setP2View({ kind: "inbox" });
      setP3View(null);
      setP4View(null);
    }
  };

  const handleRoomNameNext = (name: string, isPublic: boolean) => {
    const newSpace = createSpace(name, undefined, isPublic);
    setSpaces((prev) => [...prev, newSpace]);
    setSpacePublicSettings((prev) => new Map(prev).set(newSpace.id, isPublic));
    setLastCreatedSpaceId(newSpace.id);
    setIsCreateRoomDialogOpen(false);
  };

  const handleInviteMembers = (spaceId: string) => {
    setInviteSpaceId(spaceId);
    setIsInviteUsersScreenOpen(true);
  };

  const handleInviteUsersComplete = (
    selectedUserIds: string[],
    editorUserIds: string[]
  ) => {
    if (inviteSpaceId) {
      setSpaceMembers((prev) =>
        new Map(prev).set(inviteSpaceId, selectedUserIds)
      );
      setSpaceEditors((prev) =>
        new Map(prev).set(inviteSpaceId, editorUserIds)
      );
    }
    setIsInviteUsersScreenOpen(false);
    setInviteSpaceId(null);
  };

  const handleUpdateSpaceName = (spaceId: string, newName: string) => {
    setSpaces((prev) =>
      prev.map((s) => (s.id === spaceId ? { ...s, name: newName } : s))
    );
  };

  const toggleSpaceStar = (spaceId: string) => {
    setStarredSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  const handleUpdateSpacePublic = (spaceId: string, isPublic: boolean) => {
    setSpacePublicSettings((prev) => new Map(prev).set(spaceId, isPublic));
    setSpaces((prev) =>
      prev.map((s) => (s.id === spaceId ? { ...s, isPublic } : s))
    );
  };

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
            icon={Edit04}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              icon={UserSquare}
              label="Participant list"
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {participants.length > 0 ? (
                  participants.map((p) => (
                    <DropdownMenuItem
                      key={
                        p.type === "user"
                          ? `user-${p.data.id}`
                          : `agent-${p.data.id}`
                      }
                      label={p.type === "user" ? p.data.fullName : p.data.name}
                      icon={
                        p.type === "user" ? (
                          <Avatar
                            size="xxs"
                            name={p.data.fullName}
                            visual={p.data.portrait}
                            isRounded
                          />
                        ) : (
                          <Avatar
                            size="xxs"
                            name={p.data.name}
                            emoji={p.data.emoji}
                            backgroundColor={p.data.backgroundColor}
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
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    No participants
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem
            label="Delete"
            icon={Trash01}
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

  const renderPodNavItem = (space: Space) => {
    const isStarred = starredSpaceIds.has(space.id);
    const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
    const { count, hasActivity } = getSpaceActivity(space);
    const members = getMembersBySpaceId(space.id)
      .map((id) => getUserById(id))
      .filter((u): u is User => u != null);

    return (
      <NavigationListItem
        key={space.id}
        label={space.name}
        icon={isRestricted ? CubeOutline : Cube01}
        selected={p2View.kind === "space" && p2View.spaceId === space.id}
        count={count}
        hasActivity={hasActivity}
        moreMenu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NavigationListItemAction />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label={isStarred ? "Unstar" : "Star"}
                icon={Star01}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSpaceStar(space.id);
                }}
              />
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="My settings" />
              <DropdownMenuItem
                label="Leave"
                icon={XClose}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger label="Notifications" icon={Bell01} />
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={spaceNotificationPreferences.get(space.id) ?? "all"}
                    onValueChange={(v) =>
                      setSpaceNotificationPreferences((prev) =>
                        new Map(prev).set(
                          space.id,
                          v as SpaceNotificationPreference
                        )
                      )
                    }
                  >
                    <DropdownMenuRadioItem
                      value="never"
                      label="Don't notify me"
                    />
                    <DropdownMenuRadioItem
                      value="mentions"
                      label="Only when mentioned"
                    />
                    <DropdownMenuRadioItem value="all" label="All messages" />
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Pod" />
              <DropdownMenuItem
                label="Rename"
                icon={Edit04}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger label="Member list" icon={UserSquare} />
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    label="Manage members"
                    icon={Users01}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleInviteMembers(space.id);
                    }}
                  />
                  {members.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      label={m.fullName}
                      icon={
                        <Avatar
                          name={m.fullName}
                          visual={m.portrait}
                          size="xxs"
                          isRounded
                        />
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                label="Archive"
                icon={Archive}
                variant="warning"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Share" />
              <DropdownMenuItem
                label="Copy link"
                icon={Link01}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        }
        onClick={() => {
          setP2View({ kind: "space", spaceId: space.id });
          setP3View(null);
          setP4View(null);
        }}
      />
    );
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-foreground">Loading…</p>
      </div>
    );
  }

  // ── P2 content ────────────────────────────────────────────────────────────
  const p2Label = (() => {
    if (p2View.kind === "inbox") return "Inbox";
    if (p2View.kind === "conversations") return "Conversations";
    if (p2View.kind === "automations") return "Automations";
    if (podContext) return podContext.space.name;
    if (p2View.kind === "conversation")
      return selectedConversation?.title ?? "Conversation";
    if (p2View.kind === "agent" || p2View.kind === "person")
      return selectedCollaborator
        ? collaboratorName(selectedCollaborator)
        : "People & Agents";
    if (p2View.kind === "profile") return "Profile";
    if (p2View.kind === "templates") return "Templates";
    return "Home";
  })();

  const p2Content = (() => {
    if (p2View.kind === "profile" && user) return <ProfilePanel user={user} />;
    if (p2View.kind === "inbox")
      return (
        <InboxView
          spaces={spaces}
          conversations={allConversations}
          users={mockUsers}
          agents={mockAgents}
          currentUserId={user.id}
          activeTab={inboxActiveTab}
          personalSectionLabel="Conversations"
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
          onConversationClick={(conversation) => {
            setP3View({
              kind: "conversation",
              conversationId: conversation.id,
            });
            setP4View(null);
          }}
          onSpaceClick={(space) => {
            setP2View({ kind: "space", spaceId: space.id });
            setP3View(null);
            setP4View(null);
          }}
          onMyPodClick={() => {
            setP2View({ kind: "conversations" });
            setP3View(null);
            setP4View(null);
          }}
          onAutomationsClick={() => {
            setP2View({ kind: "automations" });
            setP3View(null);
            setP4View(null);
          }}
        />
      );
    if (p2View.kind === "templates")
      return (
        <div className="h-full overflow-auto">
          <TemplateSelection
            onTemplateClick={(t) => setSelectedTemplateForBuilder(t)}
          />
        </div>
      );
    if (p2View.kind === "conversation" && selectedConversation)
      return (
        <ConversationView
          conversation={selectedConversation}
          locutor={user}
          users={mockUsers}
          agents={mockAgents}
          conversationsWithMessages={conversationsWithMessages}
          onCitationOpen={(citation) => {
            setP3View({ kind: "citation", citation });
            setP4View(null);
          }}
        />
      );
    if (
      (p2View.kind === "agent" || p2View.kind === "person") &&
      selectedCollaborator
    )
      return (
        <PersonAgentView
          collaborator={selectedCollaborator}
          user={user}
          conversations={collaboratorConversations}
          users={mockUsers}
          agents={mockAgents}
          aboutOpen={isCollaboratorAboutOpen}
          onAboutOpenChange={setIsCollaboratorAboutOpen}
          onConversationClick={(conversation) => {
            setConversationsWithMessages((prev) =>
              prev.some((c) => c.id === conversation.id)
                ? prev
                : [...prev, conversation]
            );
            setP3View({
              kind: "conversation",
              conversationId: conversation.id,
            });
            setP4View(null);
          }}
        />
      );
    if (p2View.kind === "automations")
      return (
        <GroupConversationView
          space={MY_POD_SPACE}
          conversations={allConversations.filter(isTriggeredConversation)}
          users={mockUsers}
          agents={mockAgents}
          onConversationClick={(conversation) => {
            setP3View({
              kind: "conversation",
              conversationId: conversation.id,
            });
            setP4View(null);
          }}
          activeTab="conversations"
          podVariant="personal"
          showComposer={false}
          hideConversationFilters
          currentUserId={user.id}
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
        />
      );
    if (podContext)
      return (
        <GroupConversationView
          space={podContext.space}
          conversations={podContext.conversations}
          users={mockUsers}
          agents={mockAgents}
          spaceMemberIds={
            podContext.variant === "shared"
              ? (spaceMembers.get(podContext.spaceId) ??
                getMembersBySpaceId(podContext.spaceId))
              : undefined
          }
          editorUserIds={
            podContext.variant === "shared"
              ? (spaceEditors.get(podContext.spaceId) ?? [])
              : undefined
          }
          onConversationClick={(conversation) => {
            setP3View({
              kind: "conversation",
              conversationId: conversation.id,
            });
            setP4View(null);
          }}
          onInviteMembers={
            podContext.variant === "shared"
              ? () => handleInviteMembers(podContext.spaceId)
              : undefined
          }
          onUpdateSpaceName={
            podContext.variant === "shared" ? handleUpdateSpaceName : undefined
          }
          onUpdateSpacePublic={
            podContext.variant === "shared"
              ? handleUpdateSpacePublic
              : undefined
          }
          spacePublicSettings={spacePublicSettings}
          activeTab={
            podContext.variant === "personal" ? "conversations" : activePodTab
          }
          onTabChange={
            podContext.variant === "personal" ? undefined : setActivePodTab
          }
          dynamicFileTabIds={dynamicFileTabIds}
          onAddFileToTopbar={handlePodFileDrop}
          // Pod files open in a panel (frames take focus, others share).
          onFileOpen={(dataSource) => {
            setP3View({ kind: "file", dataSource });
            setP4View(null);
          }}
          onFileDragChange={handlePodFileDragChange}
          fileToRevealInKnowledge={fileToRevealInKnowledge}
          onFileToRevealInKnowledgeHandled={() =>
            setFileToRevealInKnowledge(null)
          }
          podVariant={podContext.variant}
          showComposer
          currentUserId={user.id}
          podTabCustomization={
            podContext.variant === "shared"
              ? {
                  tabs: podTabCustomizationTabs,
                  addableFiles: addablePodFiles,
                  onReorder: handlePodFileReorder,
                  onChangeIcon: handlePodTabIconChange,
                  onRemove: handlePodRemoveTab,
                  onAdd: (file) =>
                    handlePodFileDrop(file.id, { activateTab: false }),
                }
              : undefined
          }
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
        />
      );
    // welcome
    return (
      <NewConversation
        greeting={greeting}
        spaces={spaces}
        agentTab={welcomeAgentTab}
        onAgentTabChange={setWelcomeAgentTab}
        agentSort={welcomeAgentSort}
        onAgentSortChange={setWelcomeAgentSort}
        agentType={welcomeAgentType}
        onAgentTypeChange={setWelcomeAgentType}
        agentCategory={welcomeAgentCategory}
        onAgentCategoryChange={setWelcomeAgentCategory}
        onToolbarPinnedChange={setIsWelcomeToolbarPinned}
      />
    );
  })();

  // ── P3 / P4 content ───────────────────────────────────────────────────────
  // Side-panel kinds are rendered by the shared helper; P3 additionally hosts
  // full conversations (handled below).
  const renderSidePanel = (
    view: SidePanelView,
    setView: (view: SidePanelView) => void,
    filesSource: Conversation | null | undefined
  ) =>
    sidePanelContent({
      view,
      setView,
      filesSource,
      conversationPool: conversationsWithMessages,
    });

  const p3Label =
    p3View === null
      ? "Panel 3"
      : p3View.kind === "conversation"
        ? (p3Conversation?.title ?? "Conversation")
        : sidePanelLabel(p3View);

  const p3SizingType: PanelSizingType =
    p3View === null
      ? "secondary"
      : p3View.kind === "conversation"
        ? "default"
        : sidePanelSizing(p3View);

  const p3Content = (() => {
    if (!p3View) return null;
    if (p3View.kind === "conversation" && p3Conversation)
      return (
        <ConversationView
          conversation={p3Conversation}
          locutor={user}
          users={mockUsers}
          agents={mockAgents}
          conversationsWithMessages={conversationsWithMessages}
          onCitationOpen={(citation) =>
            setP4View({ kind: "citation", citation })
          }
        />
      );
    if (p3View.kind !== "conversation")
      return renderSidePanel(p3View, setP3View, selectedConversation);
    return null;
  })();

  const p4Label = p4View === null ? "Attachment" : sidePanelLabel(p4View);

  const p4SizingType: PanelSizingType =
    p4View === null ? "secondary" : sidePanelSizing(p4View);

  const p4Content = p4View
    ? renderSidePanel(p4View, setP4View, p3Conversation)
    : null;

  // ── Panel top bars ────────────────────────────────────────────────────────
  // `target` is the slot the side panel opens into (P3 for the level-1
  // conversation, P4 for a level-2 one).
  const conversationActionsFor = (target: "p3" | "p4") => (
    <ConversationActions
      onToggle={(kind) => {
        if (target === "p3") {
          setP3View(p3View?.kind === kind ? null : { kind });
          setP4View(null);
        } else {
          setP4View(p4View?.kind === kind ? null : { kind });
        }
      }}
    />
  );

  const podTopBarLeft =
    podContext?.variant === "shared" ? (
      <div
        className={
          "flex min-w-0 flex-1 items-center gap-0.5 rounded-lg " +
          (draggingPodFileId ? "bg-highlight-50" : "")
        }
        onDragOver={(event) => {
          if (draggingPodFileId) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingPodFileId) {
            handlePodFileDrop(draggingPodFileId);
          }
        }}
      >
        <NavTabPill
          value={activePodTab}
          onValueChange={setActivePodTab}
          className="min-w-0 overflow-hidden"
        >
          <NavTabPillList>
            {podTabOptions.map((option) => {
              if (!option.icon) {
                return null;
              }

              return (
                <NavTabPillTrigger
                  key={option.value}
                  value={option.value}
                  icon={option.icon}
                  aria-label={option.tooltip ?? option.label}
                  onContextMenu={(event) => {
                    if (!option.contextMenuItems?.length) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    setTabContextMenu({
                      value: option.value,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  {option.label}
                </NavTabPillTrigger>
              );
            })}
          </NavTabPillList>
        </NavTabPill>
        {tabContextMenu && tabContextMenuOption?.contextMenuItems && (
          <DropdownMenu
            open
            onOpenChange={(open) => {
              if (!open) {
                setTabContextMenu(null);
              }
            }}
            modal
          >
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="start"
                className="whitespace-nowrap"
                style={{
                  position: "fixed",
                  left: tabContextMenu.x,
                  top: tabContextMenu.y,
                }}
              >
                {tabContextMenuOption.contextMenuItems.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    label={item.label}
                    icon={item.icon}
                    variant={item.variant}
                    onClick={() => {
                      item.onClick?.();
                      setTabContextMenu(null);
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        )}
      </div>
    ) : null;

  const podTopBarRight = (() => {
    if (!podContext || !shouldShowMemberChrome(podContext.variant)) return null;
    const memberIds =
      spaceMembers.get(podContext.spaceId) ??
      getMembersBySpaceId(podContext.spaceId);
    const memberAvatars = memberIds
      .map((id) => mockUsers.find((u) => u.id === id))
      .filter((u): u is (typeof mockUsers)[0] => !!u)
      .slice(0, 5)
      .map((u) => ({
        name: u.fullName,
        visual: u.portrait,
        isRounded: true as const,
      }));
    return (
      <div className="flex items-center gap-2">
        {memberAvatars.length > 0 && (
          <div className="hidden md:flex md:items-center">
            <Avatar.Stack
              avatars={memberAvatars}
              nbVisibleItems={memberAvatars.length}
              orientation="horizontal"
              hasMagnifier={false}
              size="xs"
            />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={DotsHorizontal}
              variant="ghost"
              size="sm"
              tooltip="Pod options"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent collisionPadding={8}>
            <DropdownMenuItem label="Leave the Pod" icon={XClose} />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Notifications" icon={Bell01} />
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value="all">
                  <DropdownMenuRadioItem
                    value="never"
                    label="Don't notify me"
                  />
                  <DropdownMenuRadioItem
                    value="mentions"
                    label="Only when mentioned"
                  />
                  <DropdownMenuRadioItem value="all" label="All messages" />
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  })();

  const p2TopBarLeft = (() => {
    if (p2View.kind === "conversation" && selectedConversation)
      return (
        <Breadcrumbs
          items={[{ label: selectedConversation.title }]}
          size="sm"
          hasLighterFont
        />
      );
    if (
      (p2View.kind === "agent" || p2View.kind === "person") &&
      selectedCollaborator
    )
      return (
        <div className="label-sm inline-flex h-9 min-w-0 items-center gap-2 border border-transparent px-2">
          <Avatar
            size="xs"
            {...collaboratorAvatarProps(selectedCollaborator)}
          />
          <span className="truncate text-sm text-foreground">
            {collaboratorName(selectedCollaborator)}
          </span>
        </div>
      );
    if (p2View.kind === "inbox")
      return (
        <NavTabPill
          value={inboxActiveTab}
          onValueChange={(value) =>
            setInboxActiveTab(value as "conversations" | "tasks")
          }
        >
          <NavTabPillList>
            <NavTabPillTrigger
              value="conversations"
              icon={MessageChatSquare}
              aria-label="Conversations"
            >
              Conversations
            </NavTabPillTrigger>
            <NavTabPillTrigger
              value="tasks"
              icon={CheckCircle}
              aria-label="Tasks"
            >
              Tasks
            </NavTabPillTrigger>
          </NavTabPillList>
        </NavTabPill>
      );
    if (p2View.kind === "conversations")
      return (
        <Breadcrumbs
          items={[{ label: "Conversations", icon: MessageChatSquare }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "automations")
      return (
        <Breadcrumbs
          items={[{ label: "Automations", icon: Zap }]}
          size="sm"
          hasLighterFont
        />
      );
    if (podContext) return podTopBarLeft;
    if (p2View.kind === "profile")
      return (
        <Breadcrumbs items={[{ label: "Profile" }]} size="sm" hasLighterFont />
      );
    if (p2View.kind === "templates")
      return (
        <Breadcrumbs
          items={[{ label: "Templates" }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "welcome")
      return (
        <div
          className={
            "w-full transition-opacity duration-200 " +
            (isWelcomeToolbarPinned
              ? "opacity-100"
              : "opacity-0 pointer-events-none")
          }
          aria-hidden={!isWelcomeToolbarPinned}
        >
          <NewConversationActionBar
            value={welcomeAgentTab}
            onValueChange={setWelcomeAgentTab}
            agentSort={welcomeAgentSort}
            onAgentSortChange={setWelcomeAgentSort}
            agentType={welcomeAgentType}
            onAgentTypeChange={setWelcomeAgentType}
            agentCategory={welcomeAgentCategory}
            onAgentCategoryChange={setWelcomeAgentCategory}
          />
        </div>
      );
    return null;
  })();

  const p2TopBarRight = (() => {
    if (p2View.kind === "conversation") return conversationActionsFor("p3");
    if (
      (p2View.kind === "agent" || p2View.kind === "person") &&
      selectedCollaborator
    ) {
      return (
        <Button
          label="About"
          size="sm"
          variant="outline"
          onClick={() => setIsCollaboratorAboutOpen(true)}
        />
      );
    }
    if (podContext) return podTopBarRight;
    return null;
  })();

  const p3TopBarLeft = (() => {
    if (p3View?.kind === "conversation" && p3Conversation)
      return (
        <Breadcrumbs
          items={[{ label: p3Conversation.title }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p3View !== null && p3View.kind !== "conversation")
      return (
        <Breadcrumbs items={[{ label: p3Label }]} size="sm" hasLighterFont />
      );
    return null;
  })();

  const p3TopBarRight =
    p3View?.kind === "conversation" ? conversationActionsFor("p4") : null;

  const p4TopBarLeft = p4View ? (
    <Breadcrumbs items={[{ label: p4Label }]} size="sm" hasLighterFont />
  ) : null;

  // ── Sidebar (Nav) top bar ─────────────────────────────────────────────────
  const navTopBar = (
    <NavTabPill
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as "chat" | "spaces" | "admin")}
    >
      <NavTabPillList>
        <NavTabPillTrigger value="chat" icon={IntersectDust}>
          Work
        </NavTabPillTrigger>
        <NavTabPillTrigger value="spaces" icon={Planet}>
          Spaces
        </NavTabPillTrigger>
        <NavTabPillTrigger value="admin" icon={Settings01}>
          Admin
        </NavTabPillTrigger>
      </NavTabPillList>
    </NavTabPill>
  );

  // ── Sidebar (Nav) content ─────────────────────────────────────────────────
  const navContent = (
    <div className="flex min-h-0 flex-1 flex-col bg-app-background">
      {/* ── Chat tab ── */}
      {activeTab === "chat" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            <div className="z-50 flex justify-end gap-2 p-sidebar-side-spacing">
              <div className="flex-1">
                <SearchInput
                  name="search"
                  value={searchText}
                  onChange={setSearchText}
                  placeholder="Search"
                />
              </div>
              <Button
                variant="highlight"
                tooltip="Create a new conversation"
                size="sm"
                icon={MessagePlusCircle}
                label="New"
                className="shrink-0"
                onClick={() => {
                  setP2View({ kind: "welcome" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
            </div>

            <NavigationList className="mx-sidebar-side-spacing pt-1">
              <NavigationListItem
                icon={Robot}
                label="Agents"
                keepHoverOnMoreMenu
                moreMenu={
                  <div
                    className={cn(
                      "absolute right-2 top-1.5",
                      "transition-opacity",
                      "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
                      "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
                      "has-[[data-state=open]]:opacity-100"
                    )}
                  >
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="xs"
                          icon={Plus}
                          label="New"
                          variant="ghost-secondary"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="bottom"
                        align="center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuLabel label="New agent" />
                        <DropdownMenuItem icon={File02} label="From scratch" />
                        <DropdownMenuItem
                          icon={MagicWand02}
                          label="From template"
                          onClick={() => {
                            setP2View({ kind: "templates" });
                            setP3View(null);
                          }}
                        />
                        <DropdownMenuItem icon={Brackets} label="From YAML" />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                }
              />
              <NavigationListItem
                icon={PuzzlePiece01}
                label="Skills"
                keepHoverOnMoreMenu
                moreMenu={
                  <div
                    className={cn(
                      "absolute right-2 top-1.5",
                      "transition-opacity",
                      "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
                      "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
                      "has-[[data-state=open]]:opacity-100"
                    )}
                  >
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="xs"
                          icon={Plus}
                          label="New"
                          variant="ghost-secondary"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="bottom"
                        align="center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuLabel label="New skill" />
                        <DropdownMenuItem
                          icon={PuzzlePiece01}
                          label="From scratch"
                        />
                        <DropdownMenuItem
                          icon={FolderOpen}
                          label="From existing"
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                }
              />
              <NavigationListItem
                label="Inbox"
                icon={Mail01}
                selected={p2View.kind === "inbox"}
                count={unreadCount > 0 ? unreadCount : undefined}
                onClick={() => {
                  setP2View({ kind: "inbox" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
              <NavigationListItem
                label="Conversations"
                icon={MessageChatSquare}
                selected={p2View.kind === "conversations"}
                onClick={() => {
                  setP2View({ kind: "conversations" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
              <NavigationListItem
                label="Automations"
                icon={Zap}
                selected={p2View.kind === "automations"}
                onClick={() => {
                  setP2View({ kind: "automations" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
            </NavigationList>

            {starredSpaces.length > 0 && (
              <NavigationList className="mx-sidebar-side-spacing">
                <NavigationListCollapsibleSection
                  label="Starred"
                  type="collapse"
                  defaultOpen={true}
                  visibleItems={5}
                >
                  {starredSpaces.map(renderPodNavItem)}
                </NavigationListCollapsibleSection>
              </NavigationList>
            )}

            <NavigationList className="mx-sidebar-side-spacing flex-shrink-0">
              <NavigationListCollapsibleSection
                label="Pods"
                type="collapse"
                defaultOpen={true}
                visibleItems={4}
                action={
                  <>
                    {unstarredSpaces.length > 0 && (
                      <Button
                        size="xs"
                        icon={Plus}
                        label="New"
                        variant="ghost-secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsCreateRoomDialogOpen(true);
                        }}
                      />
                    )}
                    <PopoverRoot>
                      <PopoverTrigger asChild>
                        <Button
                          size="xs"
                          icon={DotsHorizontal}
                          variant="ghost"
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        className="flex w-80 flex-col p-0"
                        align="start"
                        collisionPadding={16}
                      >
                        <div className="shrink-0 p-3 pb-2">
                          <SearchInput
                            name="browse-pods-search"
                            placeholder="Search Pods..."
                            value={podBrowseSearch}
                            onChange={setPodBrowseSearch}
                          />
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                          {browsableSpaces.length === 0 ? (
                            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                              No Pods found
                            </div>
                          ) : (
                            browsableSpaces.map((space) => {
                              const isRestricted =
                                space.id.charCodeAt(space.id.length - 1) % 2 ===
                                0;
                              return (
                                <div
                                  key={space.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-muted-background"
                                  onClick={() => {
                                    setP2View({
                                      kind: "space",
                                      spaceId: space.id,
                                    });
                                    setP3View(null);
                                    setP4View(null);
                                    setPodBrowseSearch("");
                                  }}
                                >
                                  <Icon
                                    visual={isRestricted ? CubeOutline : Cube01}
                                    size="sm"
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm">
                                      {space.name}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      {space.description || "No description"}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </PopoverContent>
                    </PopoverRoot>
                  </>
                }
              >
                {unstarredSpaces.length > 0 ? (
                  unstarredSpaces.map(renderPodNavItem)
                ) : (
                  <NavigationListItem
                    label="Create a Pod"
                    icon={Plus}
                    onClick={() => setIsCreateRoomDialogOpen(true)}
                  />
                )}
              </NavigationListCollapsibleSection>
            </NavigationList>

            {(filteredCollaborators.length > 0 || !searchText.trim()) && (
              <NavigationList className="mx-sidebar-side-spacing">
                <NavigationListCollapsibleSection
                  label="People & Agents"
                  type="collapse"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xs"
                        icon={Plus}
                        label="New"
                        variant="ghost-secondary"
                        tooltip="Create an Agent"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openCreateAgent();
                        }}
                      />
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xs"
                            icon={DotsHorizontal}
                            variant="ghost"
                            aria-label="People and Agents options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel label="Agents" />
                          <DropdownMenuItem
                            label="Create agent"
                            icon={Plus}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openCreateAgent();
                            }}
                          />
                          <DropdownMenuItem
                            icon={ContactsRobot}
                            label="Manage"
                          />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                              icon={Edit04}
                              label="Edit"
                            />
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent
                                dropdownHeaders={
                                  <DropdownMenuSearchbar
                                    autoFocus
                                    value={agentSearchText}
                                    onChange={setAgentSearchText}
                                    name="agent-search"
                                    placeholder="Search agents"
                                  />
                                }
                              >
                                {filteredAgents.length > 0 ? (
                                  [...filteredAgents]
                                    .sort((a, b) =>
                                      a.name.localeCompare(b.name)
                                    )
                                    .map((agent) => (
                                      <DropdownMenuItem
                                        key={agent.id}
                                        label={agent.name}
                                        icon={
                                          <Avatar
                                            size="xxs"
                                            name={agent.name}
                                            emoji={agent.emoji}
                                            backgroundColor={
                                              agent.backgroundColor
                                            }
                                          />
                                        }
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          addCollaborator({
                                            type: "agent",
                                            data: agent,
                                          });
                                          selectCollaborator("agent", agent.id);
                                        }}
                                      />
                                    ))
                                ) : (
                                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                                    No agents found
                                  </div>
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                          <DropdownMenuLabel label="People" />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                              icon={UserSquare}
                              label="Browse"
                            />
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent
                                dropdownHeaders={
                                  <DropdownMenuSearchbar
                                    autoFocus
                                    value={peopleSearchText}
                                    onChange={setPeopleSearchText}
                                    name="people-search"
                                    placeholder="Search people"
                                  />
                                }
                              >
                                {filteredPeople.length > 0 ? (
                                  [...filteredPeople]
                                    .sort((a, b) =>
                                      a.fullName.localeCompare(b.fullName)
                                    )
                                    .map((person) => (
                                      <DropdownMenuItem
                                        key={person.id}
                                        label={person.fullName}
                                        icon={
                                          <Avatar
                                            size="xxs"
                                            name={person.fullName}
                                            visual={person.portrait}
                                            isRounded
                                          />
                                        }
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          addCollaborator({
                                            type: "person",
                                            data: person,
                                          });
                                          selectCollaborator(
                                            "person",
                                            person.id
                                          );
                                        }}
                                      />
                                    ))
                                ) : (
                                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                                    No people found
                                  </div>
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {filteredCollaborators.map((collaborator) => {
                    if (collaborator.type === "agent") {
                      const agent = collaborator.data;
                      return (
                        <NavigationListItem
                          key={`agent-${agent.id}`}
                          label={agent.name}
                          selected={
                            p2View.kind === "agent" &&
                            p2View.agentId === agent.id
                          }
                          avatar={
                            <Avatar
                              size="xxs"
                              name={agent.name}
                              emoji={agent.emoji}
                              backgroundColor={agent.backgroundColor}
                              isRounded={false}
                            />
                          }
                          moreMenu={
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <NavigationListItemAction />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem
                                  label="Edit"
                                  icon={Edit04}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    selectCollaborator("agent", agent.id);
                                  }}
                                />
                                <DropdownMenuItem
                                  label="Remove from favorites"
                                  icon={Star01}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeCollaborator("agent", agent.id);
                                  }}
                                />
                                <DropdownMenuItem
                                  label="Delete"
                                  icon={Trash01}
                                  variant="warning"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeCollaborator("agent", agent.id);
                                  }}
                                />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          }
                          onClick={() => {
                            selectCollaborator("agent", agent.id);
                          }}
                        />
                      );
                    }
                    const person = collaborator.data;
                    return (
                      <NavigationListItem
                        key={`person-${person.id}`}
                        label={person.fullName}
                        selected={
                          p2View.kind === "person" &&
                          p2View.personId === person.id
                        }
                        avatar={
                          <Avatar
                            size="xxs"
                            name={person.fullName}
                            visual={person.portrait}
                            isRounded
                          />
                        }
                        moreMenu={
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <NavigationListItemAction />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                label="View profile"
                                icon={User01}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  selectCollaborator("person", person.id);
                                }}
                              />
                              <DropdownMenuItem
                                label="Remove from favorites"
                                icon={Trash01}
                                variant="warning"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeCollaborator("person", person.id);
                                }}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        }
                        onClick={() => {
                          selectCollaborator("person", person.id);
                        }}
                      />
                    );
                  })}
                </NavigationListCollapsibleSection>
              </NavigationList>
            )}

            <NavigationList className="mx-sidebar-side-spacing">
              {(recentConversations.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Recent"
                  type="collapse"
                  defaultOpen={true}
                  action={
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="xmini"
                          icon={DotsHorizontal}
                          variant="ghost"
                          aria-label="Recent options"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuLabel label="Recent" />
                        <DropdownMenuItem
                          label={
                            hideTriggeredConversations
                              ? "Show triggered"
                              : "Hide triggered"
                          }
                          icon={hideTriggeredConversations ? Zap : ZapOff}
                          onClick={() =>
                            setHideTriggeredConversations(
                              !hideTriggeredConversations
                            )
                          }
                        />
                        <DropdownMenuItem
                          label="Edit history"
                          icon={CheckDone01}
                        />
                        <DropdownMenuItem
                          label="Clear history"
                          variant="warning"
                          icon={Trash01}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                >
                  {recentConversations.map((c) => (
                    <NavigationListItem
                      key={c.id}
                      label={c.title}
                      selected={
                        p2View.kind === "conversation" &&
                        p2View.conversationId === c.id
                      }
                      moreMenu={getConversationMoreMenu(c)}
                      onClick={() => {
                        setP2View({
                          kind: "conversation",
                          conversationId: c.id,
                        });
                        setP3View(null);
                        setP4View(null);
                      }}
                    />
                  ))}
                </NavigationListCollapsibleSection>
              )}
            </NavigationList>
          </ScrollArea>
        </div>
      )}

      {activeTab === "spaces" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Spaces — TBD
          </div>
        </div>
      )}
      {activeTab === "admin" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Admin — TBD
          </div>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-hover data-[state=open]:bg-selected rounded-xl p-2 m-2">
          <div className="group flex cursor-pointer items-center justify-between gap-2">
            <span className="sr-only">Open user menu</span>
            <div className="flex gap-2 items-center min-w-0">
              <Avatar
                name={user.fullName}
                visual={user.portrait}
                size="sm"
                isRounded
              />
              <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span className="heading-sm w-full truncate text-foreground">
                  {user.firstName}
                </span>
                <span className="-mt-0.5 w-full truncate text-sm text-muted-foreground">
                  ACME
                </span>
              </div>
            </div>
            <Icon
              visual={ChevronDown}
              className="text-muted-foreground group-hover:text-primary-400"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            label="Profile"
            icon={User01}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setP2View({ kind: "profile" });
              setP3View(null);
              setP4View(null);
            }}
          />
          <DropdownMenuItem
            label="Administration"
            icon={Settings01}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger icon={Heart} label="Help & Support" />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  label="Quickstart Guide"
                  icon={Lightbulb04}
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
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            label="Signout"
            icon={LogOut01}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      <PanelLayout>
        <PanelLayoutNav topBarLeft={navTopBar}>
          {(onNavClose) => (
            <div className="flex min-h-0 flex-1 flex-col" onClick={onNavClose}>
              {navContent}
            </div>
          )}
        </PanelLayoutNav>

        {/* P2 — Level 1: space, direct conversation, profile, welcome */}
        <PanelLayoutPanel
          label={p2Label}
          isOpen={true}
          onClose={() => {}}
          topBarLeft={p2TopBarLeft}
          topBarRight={p2TopBarRight}
        >
          {p2Content}
        </PanelLayoutPanel>

        {/* P3 — Level 2: conversation from a space (takes focus), or a side
            panel from the P2 conversation (sizing per its kind) */}
        <PanelLayoutPanel
          label={p3Label}
          sizingType={p3SizingType}
          // Any file view gets fullscreen, wherever it was opened from.
          fullscreenEnabled={isFileView(p3View)}
          isOpen={p3View !== null}
          onClose={() => {
            setP3View(null);
            setP4View(null);
          }}
          topBarLeft={p3TopBarLeft}
          topBarRight={p3TopBarRight}
        >
          {p3Content}
        </PanelLayoutPanel>

        {/* P4 — Level 3: citation / file / files / credits */}
        <PanelLayoutPanel
          label={p4Label}
          sizingType={p4SizingType}
          fullscreenEnabled={isFileView(p4View)}
          isOpen={p4View !== null}
          onClose={() => setP4View(null)}
          topBarLeft={p4TopBarLeft}
        >
          {p4Content}
        </PanelLayoutPanel>
      </PanelLayout>

      {/* Dialogs (outside PanelLayout, portaled to body) */}
      <CreateRoomDialog
        isOpen={isCreateRoomDialogOpen}
        onClose={() => setIsCreateRoomDialogOpen(false)}
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
          className="flex h-full max-h-full overflow-hidden rounded-none p-0"
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
        hasMultipleSelect
      />
    </>
  );
}

export default PeopleAgent;
