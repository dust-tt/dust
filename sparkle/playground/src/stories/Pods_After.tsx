import {
  Archive,
  Attachment01,
  Avatar,
  Bell01,
  ZapOff,
  Breadcrumbs,
  Button,
  Card,
  MessageCircle01,
  MessageChatSquare,
  CheckCircle,
  Settings01,
  UserSquare,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Eye,
  Heart,
  Inbox01,
  Lightbulb04,
  Link01,
  LogOut01,
  DotsHorizontal,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  Edit04,
  Planet,
  Plus,
  PuzzlePiece01,
  ScrollArea,
  ScrollBar,
  SearchInput,
  SlackLogo,
  SpaceClosed,
  SpaceOpen,
  Star01,
  Trash01,
  Users01,
  User01,
  XClose,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentBuilderView } from "../components/AgentBuilderView";
import { ConversationView } from "../components/ConversationView";
import { CreateRoomDialog } from "../components/CreateRoomDialog";
import { FreeButtonSwitch } from "../components/FreeButtonSwitch";
import { GroupConversationView } from "../components/GroupConversationView";
import { InboxView } from "../components/InboxView";
import { InputBar } from "../components/InputBar";
import { InviteUsersScreen } from "../components/InviteUsersScreen";
import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
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
  mockAgents,
  mockConversations,
  mockUsers,
  type Space,
  type User,
} from "../data";
import { getDataSourcesBySpaceId } from "../data/dataSources";
import { getRandomGreetingForName } from "../data/greetings";
import {
  buildPodTabOptions,
  getDefaultMainTabOrder,
  getFileTabValue,
  resolvePodContext,
  shouldShowMemberChrome,
  type DynamicFileTab,
  type PodTabOption,
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

type SelectedCitation = { title: string; icon?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSpaceActivity(space: Space) {
  const c = space.id.charCodeAt(space.id.length - 1);
  const count = c % 3 === 0 ? (c % 9) + 1 : undefined;
  return { count, hasActivity: count ? true : c % 2 !== 0 };
}

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

// ── Main component ────────────────────────────────────────────────────────────

export default function Pods_After() {
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
      ...getRandomUsers(peopleCount).map((d) => ({
        type: "person" as const,
        data: d,
      })),
    ]);
    const randomSpaces = getRandomSpaces(Math.floor(Math.random() * 7) + 3);
    setSpaces(randomSpaces);
    setStarredSpaceIds(
      new Set(randomSpaces.slice(0, 2).map((space) => space.id))
    );
    const conversations = createConversationsWithMessages(u.id);
    setConversationsWithMessages(conversations);
    setStarredConversationIds(
      new Set(conversations.slice(0, 2).map((conversation) => conversation.id))
    );
  }, []);

  // ── Navigation state ──────────────────────────────────────────────────────
  // P2 selection: what's shown in the "level 1" panel
  type P2View =
    | { kind: "welcome" }
    | { kind: "inbox" }
    | { kind: "myPod" }
    | { kind: "conversation"; conversationId: string }
    | { kind: "space"; spaceId: string }
    | { kind: "profile" }
    | { kind: "templates" };

  const [p2View, setP2View] = useState<P2View>({ kind: "inbox" });
  const [cameFromInbox, setCameFromInbox] = useState(false);

  // P3: conversation from a space (level 2) OR citation from a level-1 conversation
  type P3View =
    | { kind: "conversation"; conversationId: string }
    | { kind: "citation"; citation: SelectedCitation };

  const [p3View, setP3View] = useState<P3View | null>(null);

  // P4: citation/attachment opened from a level-2 conversation
  const [p4Citation, setP4Citation] = useState<SelectedCitation | null>(null);

  // ── Space panel tab state (lifted from GroupConversationView) ────────────
  const [spaceActiveTab, setSpaceActiveTab] = useState("conversations");
  const [myPodActiveTab, setMyPodActiveTab] = useState("conversations");
  const [inboxActiveTab, setInboxActiveTab] = useState("conversations");
  const [podTabsBySpaceId, setPodTabsBySpaceId] = useState<
    Map<string, PodTabsState>
  >(new Map());
  const [draggingPodFileId, setDraggingPodFileId] = useState<string | null>(
    null
  );
  const [draggingPodFileName, setDraggingPodFileName] = useState<string | null>(
    null
  );
  const [fileToRevealInKnowledge, setFileToRevealInKnowledge] = useState<
    string | null
  >(null);

  // ── Sidebar UI state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [isAgentsDropdownOpen, setIsAgentsDropdownOpen] = useState(false);
  const [spaceNotificationPreferences, setSpaceNotificationPreferences] =
    useState<Map<string, SpaceNotificationPreference>>(new Map());
  const [starredSpaceIds, setStarredSpaceIds] = useState<Set<string>>(
    new Set()
  );
  const [starredConversationIds, setStarredConversationIds] = useState<
    Set<string>
  >(new Set());

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
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return allConversations.filter((conv) => {
      if (!conv.spaceId) return false;
      return conv.updatedAt >= twoDaysAgo;
    }).length;
  }, [allConversations]);

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

  const podScopedConversations = useMemo(() => {
    const spaceIds = new Set(spaces.map((s) => s.id));
    return allConversations.filter(
      (conv) =>
        (conv.spaceId != null && spaceIds.has(conv.spaceId)) ||
        conv.spaceId == null
    );
  }, [allConversations, spaces]);

  const starredConversations = useMemo(() => {
    const pool = podScopedConversations.filter((c) =>
      starredConversationIds.has(c.id)
    );

    const filtered = searchText.trim()
      ? pool.filter((c) =>
          c.title.toLowerCase().includes(searchText.toLowerCase())
        )
      : pool;

    return [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }, [podScopedConversations, starredConversationIds, searchText]);

  const recentConversations = useMemo(() => {
    const pool = podScopedConversations.filter(
      (c) => !starredConversationIds.has(c.id)
    );

    const filtered = searchText.trim()
      ? pool.filter((c) =>
          c.title.toLowerCase().includes(searchText.toLowerCase())
        )
      : pool;

    return [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }, [podScopedConversations, starredConversationIds, searchText]);

  const selectedConversationId =
    p2View.kind === "conversation" ? p2View.conversationId : null;

  const podContext = useMemo(
    () => resolvePodContext(p2View, spaces, allConversations),
    [p2View, spaces, allConversations]
  );

  const activePodTab =
    podContext?.variant === "personal" ? myPodActiveTab : spaceActiveTab;
  const setActivePodTab =
    podContext?.variant === "personal" ? setMyPodActiveTab : setSpaceActiveTab;

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

  const basePodTabOptions = useMemo((): PodTabOption[] => {
    if (!podContext || !currentPodTabsState) {
      return [];
    }

    return buildPodTabOptions(
      podContext.variant,
      currentPodTabsState.mainTabOrder,
      currentPodTabsState.dynamicFileTabs
    );
  }, [podContext, currentPodTabsState]);

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

  const handlePodTabReorder = useCallback(
    (nextOptions: PodTabOption[]) => {
      if (!podContext) {
        return;
      }

      const mainTabOrder = nextOptions
        .filter((option) => option.pinned !== "end")
        .map((option) => option.value);

      setPodTabsBySpaceId((prev) => {
        const existing = prev.get(podContext.spaceId) ?? {
          mainTabOrder: getDefaultMainTabOrder(podContext.variant),
          dynamicFileTabs: [],
        };

        return new Map(prev).set(podContext.spaceId, {
          ...existing,
          mainTabOrder,
        });
      });
    },
    [podContext]
  );

  const handlePodFileDrop = useCallback(
    (fileId: string) => {
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
      setActivePodTab(fileTabValue);
      setDraggingPodFileId(null);
      setDraggingPodFileName(null);
    },
    [podContext, setActivePodTab]
  );

  const handlePodFileDragChange = useCallback(
    (fileId: string | null, fileName?: string | null) => {
      setDraggingPodFileId(fileId);
      setDraggingPodFileName(fileName ?? null);
    },
    []
  );

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

  // ── Handlers ──────────────────────────────────────────────────────────────
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

  const toggleConversationStar = (conversationId: string) => {
    setStarredConversationIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
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

  const handleConversationNavClick = (
    conversation: Conversation,
    options?: { openInPod?: boolean }
  ) => {
    setCameFromInbox(false);
    setP4Citation(null);

    if (options?.openInPod) {
      if (conversation.spaceId) {
        setP2View({ kind: "space", spaceId: conversation.spaceId });
      } else {
        setP2View({ kind: "myPod" });
      }
      setP3View({
        kind: "conversation",
        conversationId: conversation.id,
      });
      return;
    }

    setP2View({ kind: "conversation", conversationId: conversation.id });
    setP3View(null);
  };

  const isConversationSidebarSelected = (conversationId: string) =>
    (p2View.kind === "conversation" &&
      p2View.conversationId === conversationId) ||
    (p3View?.kind === "conversation" &&
      p3View.conversationId === conversationId);

  const renderConversationMenuItems = (
    conversation: Conversation,
    isStarred: boolean
  ) => {
    const participants = getRandomParticipants(conversation);
    return (
      <>
        <DropdownMenuItem
          label={isStarred ? "Unstar" : "Star"}
          icon={isStarred ? Star01 : Star01}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleConversationStar(conversation.id);
          }}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          label="Rename"
          icon={Edit04}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={UserSquare} label="Participant list" />
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
                <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
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
      </>
    );
  };

  const getConversationMoreMenu = (conversation: Conversation) => {
    const isStarred = starredConversationIds.has(conversation.id);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <NavigationListItemAction />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {renderConversationMenuItems(conversation, isStarred)}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const getConversationTopBarActions = (conversation: Conversation) => {
    const isStarred = starredConversationIds.has(conversation.id);
    return (
      <>
        <Button
          size="sm"
          variant="ghost-secondary"
          icon={Attachment01}
          isSelect
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost-secondary" icon={DotsHorizontal} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {renderConversationMenuItems(conversation, isStarred)}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
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
        icon={isRestricted ? SpaceOpen : SpaceClosed}
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
                icon={isStarred ? Star01 : Star01}
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
          setP4Citation(null);
        }}
      />
    );
  };

  if (!user) {
    return (
      <div className="s-flex s-h-screen s-items-center s-justify-center s-bg-background dark:s-bg-background-night">
        <p className="s-text-foreground dark:s-text-foreground-night">
          Loading…
        </p>
      </div>
    );
  }

  // ── P2 content ────────────────────────────────────────────────────────────
  const p2Label = (() => {
    if (podContext) return podContext.space.name;
    if (p2View.kind === "conversation")
      return selectedConversation?.title ?? "Conversation";
    if (p2View.kind === "profile") return "Profile";
    if (p2View.kind === "templates") return "Templates";
    if (p2View.kind === "inbox") return "Inbox";
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
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
          onConversationClick={(conversation) => {
            setP3View({
              kind: "conversation",
              conversationId: conversation.id,
            });
            setP4Citation(null);
            setCameFromInbox(true);
          }}
          onSpaceClick={(space) => {
            setP2View({ kind: "space", spaceId: space.id });
            setP3View(null);
            setP4Citation(null);
            setCameFromInbox(false);
          }}
          onMyPodClick={() => {
            setP2View({ kind: "myPod" });
            setP3View(null);
            setP4Citation(null);
            setCameFromInbox(false);
          }}
        />
      );
    if (p2View.kind === "templates")
      return (
        <div className="s-h-full s-overflow-auto">
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
            setP4Citation(null);
          }}
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
            setP4Citation(null);
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
          spacePublicSettings={
            podContext.variant === "shared" ? spacePublicSettings : undefined
          }
          activeTab={activePodTab}
          onTabChange={setActivePodTab}
          dynamicFileTabIds={dynamicFileTabIds}
          onAddFileToTopbar={handlePodFileDrop}
          onFileDragChange={handlePodFileDragChange}
          fileToRevealInKnowledge={fileToRevealInKnowledge}
          onFileToRevealInKnowledgeHandled={() =>
            setFileToRevealInKnowledge(null)
          }
          podVariant={podContext.variant}
          currentUserId={user.id}
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
        />
      );
    // welcome
    return (
      <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background dark:s-bg-background-night">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 s-px-4 s-py-8">
          <div className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
            {greeting}
          </div>
          <InputBar placeholder="Ask a question" />
          <div className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
            Chat with…
          </div>
        </div>
      </div>
    );
  })();

  // ── P3 content ────────────────────────────────────────────────────────────
  const p3Label =
    p3View?.kind === "conversation"
      ? (p3Conversation?.title ?? "Conversation")
      : p3View?.kind === "citation"
        ? p3View.citation.title
        : "Panel 3";

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
          onCitationOpen={(citation) => setP4Citation(citation)}
        />
      );
    if (p3View.kind === "citation")
      return (
        <div className="s-flex s-h-full s-flex-col s-gap-3 s-p-4">
          <p className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
            {p3View.citation.title}
          </p>
          <div className="s-flex-1 s-rounded-lg s-border s-border-separator s-bg-muted-background s-p-4 s-text-sm s-text-muted-foreground dark:s-border-separator-night dark:s-bg-muted-background-night dark:s-text-muted-foreground-night">
            Document preview placeholder
          </div>
        </div>
      );
    return null;
  })();

  // ── P4 content ────────────────────────────────────────────────────────────
  const p4Label = p4Citation?.title ?? "Attachment";
  const p4Content = p4Citation ? (
    <div className="s-flex s-h-full s-flex-col s-gap-3 s-p-4">
      <p className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
        {p4Citation.title}
      </p>
      <div className="s-flex-1 s-rounded-lg s-border s-border-separator s-bg-muted-background s-p-4 s-text-sm s-text-muted-foreground dark:s-border-separator-night dark:s-bg-muted-background-night dark:s-text-muted-foreground-night">
        Document preview placeholder
      </div>
    </div>
  ) : null;

  // ── Panel top bars ────────────────────────────────────────────────────────
  const podTopBarLeft = podContext ? (
    <FreeButtonSwitch
      value={activePodTab}
      onValueChange={setActivePodTab}
      options={podTabOptions}
      onOptionsReorder={handlePodTabReorder}
      onDropCreateOption={handlePodFileDrop}
      onRemoveOption={handlePodRemoveTab}
      isFileDragActive={draggingPodFileId !== null}
      draggingFileLabel={draggingPodFileName}
    />
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
      <div className="s-flex s-items-center s-gap-2">
        {memberAvatars.length > 0 && (
          <Avatar.Stack
            avatars={memberAvatars}
            nbVisibleItems={memberAvatars.length}
            orientation="horizontal"
            hasMagnifier={false}
            size="sm"
          />
        )}
        <Button
          size="sm"
          variant="primary"
          label="Join"
          tooltip="Join the project"
          onClick={() => {}}
        />
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
    if (p2View.kind === "inbox")
      return (
        <FreeButtonSwitch
          value={inboxActiveTab}
          onValueChange={setInboxActiveTab}
          options={[
            {
              value: "conversations",
              label: "Conversations",
              icon: MessageChatSquare,
            },
            { value: "tasks", label: "Tasks", icon: CheckCircle },
          ]}
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
    return null;
  })();

  const p2TopBarRight = (() => {
    if (p2View.kind === "conversation" && selectedConversation)
      return getConversationTopBarActions(selectedConversation);
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
    if (p3View?.kind === "citation")
      return (
        <Breadcrumbs
          items={[{ label: p3View.citation.title }]}
          size="sm"
          hasLighterFont
        />
      );
    return null;
  })();

  const p3TopBarRight =
    p3View?.kind === "conversation" && p3Conversation
      ? getConversationTopBarActions(p3Conversation)
      : null;

  const p4TopBarLeft = p4Citation ? (
    <Breadcrumbs
      items={[{ label: p4Citation.title }]}
      size="sm"
      hasLighterFont
    />
  ) : null;

  // ── Sidebar (Nav) top bar ─────────────────────────────────────────────────
  const navTopBar = (
    <FreeButtonSwitch<"chat" | "spaces" | "admin">
      value={activeTab}
      onValueChange={setActiveTab}
      options={[
        { value: "chat", label: "Chat", icon: MessageChatSquare },
        { value: "spaces", label: "Spaces", icon: Planet },
        { value: "admin", icon: Settings01 },
      ]}
    />
  );

  // ── Sidebar (Nav) content ─────────────────────────────────────────────────
  const navContent = (
    <div className="s-flex s-min-h-0 s-flex-1 s-flex-col s-bg-muted-background dark:s-bg-muted-background-night">
      {/* ── Chat tab ── */}
      {activeTab === "chat" && (
        <div className="s-flex s-min-h-0 s-flex-1 s-flex-col">
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            <div className="s-flex s-gap-2 s-p-2">
              <SearchInput
                name="search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Search"
                className="s-flex-1"
              />
              <Button
                variant="primary"
                tooltip="New Conversation"
                size="sm"
                icon={MessageCircle01}
                label="New"
                onClick={() => {
                  setP2View({ kind: "welcome" });
                  setP3View(null);
                  setP4Citation(null);
                  setCameFromInbox(false);
                }}
              />
              <DropdownMenu
                open={isAgentsDropdownOpen}
                onOpenChange={setIsAgentsDropdownOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost-secondary"
                    size="sm"
                    icon={DotsHorizontal}
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
                      icon={Plus}
                      label="Build an agent"
                    />
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        icon={Edit04}
                        label="From scratch"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenuItem
                        icon={Lightbulb04}
                        label="Browse templates"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsAgentsDropdownOpen(false);
                          setP2View({ kind: "templates" });
                          setP3View(null);
                        }}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    label="Manage agents"
                    icon={UserSquare}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="Skills" />
                  <DropdownMenuItem
                    label="New skill"
                    icon={Plus}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Manage skills"
                    icon={PuzzlePiece01}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="Conversations" />
                  <DropdownMenuItem
                    label="Clear conversation history"
                    icon={Trash01}
                    variant="warning"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <NavigationList className="s-px-2">
              {!searchText.trim() && (
                <>
                  <NavigationListItem
                    label="Inbox"
                    icon={Inbox01}
                    selected={p2View.kind === "inbox"}
                    count={unreadCount > 0 ? unreadCount : undefined}
                    onClick={() => {
                      setP2View({ kind: "inbox" });
                      setP3View(null);
                      setP4Citation(null);
                      setCameFromInbox(false);
                    }}
                  />
                  <NavigationListItem
                    label="My Pod"
                    icon={User01}
                    selected={p2View.kind === "myPod"}
                    onClick={() => {
                      setP2View({ kind: "myPod" });
                      setP3View(null);
                      setP4Citation(null);
                      setCameFromInbox(false);
                    }}
                  />
                </>
              )}
              {(starredSpaces.length > 0 ||
                starredConversations.length > 0) && (
                <NavigationListCollapsibleSection
                  label="Starred"
                  defaultOpen={true}
                >
                  {starredSpaces.map(renderPodNavItem)}
                  {starredConversations.map((c) => (
                    <NavigationListItem
                      key={c.id}
                      label={c.title}
                      icon={MessageCircle01}
                      selected={isConversationSidebarSelected(c.id)}
                      moreMenu={getConversationMoreMenu(c)}
                      onClick={() =>
                        handleConversationNavClick(c, { openInPod: true })
                      }
                    />
                  ))}
                </NavigationListCollapsibleSection>
              )}
              {/* Pods */}
              {(unstarredSpaces.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Pods"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={Plus}
                        variant="ghost-secondary"
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
                            icon={DotsHorizontal}
                            variant="ghost-secondary"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            icon={Plus}
                            label="Create"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsCreateRoomDialogOpen(true);
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {unstarredSpaces.map(renderPodNavItem)}
                </NavigationListCollapsibleSection>
              )}
              {(recentConversations.length > 0 || !searchText.trim()) && (
                <NavigationListCollapsibleSection
                  label="Recent"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={MessageChatSquare}
                        variant="ghost-secondary"
                        tooltip="New Conversation"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xmini"
                            icon={DotsHorizontal}
                            variant="ghost-secondary"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            label="Hide triggered"
                            icon={ZapOff}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Clear history"
                            variant="warning"
                            icon={Trash01}
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
                  {recentConversations.map((c) => (
                    <NavigationListItem
                      key={c.id}
                      label={c.title}
                      selected={isConversationSidebarSelected(c.id)}
                      moreMenu={getConversationMoreMenu(c)}
                      onClick={() => handleConversationNavClick(c)}
                    />
                  ))}
                </NavigationListCollapsibleSection>
              )}
            </NavigationList>
          </ScrollArea>
        </div>
      )}

      {activeTab === "spaces" && (
        <div className="s-flex s-min-h-0 s-flex-1 s-flex-col">
          <div className="s-flex s-flex-1 s-items-center s-justify-center s-text-muted-foreground dark:s-text-muted-foreground-night">
            Spaces — TBD
          </div>
        </div>
      )}
      {activeTab === "admin" && (
        <div className="s-flex s-min-h-0 s-flex-1 s-flex-col">
          <div className="s-flex s-flex-1 s-items-center s-justify-center s-text-muted-foreground dark:s-text-muted-foreground-night">
            Admin — TBD
          </div>
        </div>
      )}

      {/* Bottom bar */}
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
                  isRounded
                />
                <div className="s-flex s-min-w-0 s-grow s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
                  <span className="s-heading-sm s-truncate">
                    {user.fullName}
                  </span>
                  <span className="-s-mt-0.5 s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                    ACME
                  </span>
                </div>
              </div>
            </Card>
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
                setP4Citation(null);
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
    </div>
  );

  return (
    <>
      <PanelLayout>
        <PanelLayoutNav topBarLeft={navTopBar}>
          {(onNavClose) => (
            <div
              className="s-flex s-min-h-0 s-flex-1 s-flex-col"
              onClick={onNavClose}
            >
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

        {/* P3 — Level 2: conversation from space, or citation from P2 conversation */}
        <PanelLayoutPanel
          label={p3Label}
          isOpen={p3View !== null}
          onClose={() => {
            setP3View(null);
            setP4Citation(null);
          }}
          topBarLeft={p3TopBarLeft}
          topBarRight={p3TopBarRight}
        >
          {p3Content}
        </PanelLayoutPanel>

        {/* P4 — Level 3: citation / attachment */}
        <PanelLayoutPanel
          label={p4Label}
          isOpen={p4Citation !== null}
          onClose={() => setP4Citation(null)}
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
          className="s-flex s-h-full s-max-h-full s-overflow-hidden s-rounded-none s-p-0"
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
