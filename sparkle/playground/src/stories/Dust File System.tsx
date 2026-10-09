import {
  Archive,
  Avatar,
  Beaker02,
  Bell01,
  Breadcrumbs,
  Button,
  ChevronDown,
  Clock,
  Cube01,
  CubeOutline,
  Counter,
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Edit04,
  Eye,
  File02,
  Heart,
  Icon,
  Inbox01,
  IntersectDust,
  LayersThree01,
  Lightbulb04,
  Link01,
  LogOut01,
  MessageChatSquare,
  MessageCircle01,
  MessageLightning01,
  MessagePlusCircle,
  MessageQuestionCircle,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
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
  ShapesPlus,
  SlackLogo,
  Star01,
  User01,
  Users01,
  UserSquare,
  XClose,
  Zap,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

import { AgentBuilderView } from "../components/AgentBuilderView";
import { AvatarCounter } from "../components/AvatarCounter";
import { ToolDetailsSheet } from "../components/BuildDetails";
import type { CommandPaletteItem } from "../components/CommandPalette";
import { CommandPalette } from "../components/CommandPalette";
import { setDragPreview } from "../components/dragPreview";
import {
  BUILD_SECTIONS,
  type BuildSection,
  BuildNav,
  isBuildSection,
} from "../components/BuildNav";
import {
  ConversationActions,
  conversationFilesFor,
  fileSidePanelContent,
  fileSidePanelView,
  isFileView,
  type SelectedCitation,
  type SidePanelView,
  sidePanelContent,
  sidePanelLabel,
  sidePanelSizing,
} from "../components/ConversationSidePanels";
import { ConversationView } from "../components/ConversationView";
import type { PodDestination } from "../components/CreateRoomDialog";
import { CreateRoomDialog } from "../components/CreateRoomDialog";
import type { CreatableFileType } from "../components/FilesBrowser";
import { GroupConversationView } from "../components/GroupConversationView";
import { InboxAltView } from "../components/InboxAltView";
import { InviteUsersScreen } from "../components/InviteUsersScreen";
import { ManageAgentsView } from "../components/ManageAgentsView";
import { ManageSkillsView } from "../components/ManageSkillsView";
import { ManageToolsView } from "../components/ManageToolsView";
import type { InputBarAttachment } from "../components/InputBar";
import { NewConversation } from "../components/NewConversation";
import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
  type PanelSizingType,
} from "../components/PanelLayout";
import { PersonAgentView } from "../components/PersonAgentView";
import { ProfilePanel } from "../components/Profile";
import { RequestDetailView } from "../components/RequestDetailView";
import type { RequestsTab } from "../components/RequestsView";
import { RequestsView } from "../components/RequestsView";
import {
  SidebarSearch,
  useSidebarShortcuts,
} from "../components/SidebarSearch";
import { TriggersManageView } from "../components/TriggersManageView";
import { WakeUpsManageView } from "../components/WakeUpsManageView";
import { WorkspaceFileSystem } from "../components/WorkspaceFileSystem";
import {
  type AdminRequest,
  type Agent,
  type AvatarData,
  buildWorkspace,
  canDropInto,
  type Conversation,
  createManagedAgent,
  createManagedSkill,
  createMockTool,
  type DataSource,
  type DataSourceFileType,
  DEFAULT_POD_NOTIFICATION_CONDITION,
  deriveFolderFiles,
  entryForDataSource,
  entryKey,
  getAgentById,
  getCollaboratorConversations,
  getMembersBySpaceId,
  getRandomUsers,
  getUserById,
  hasEntry,
  hasEntryDrag,
  hasFileDrag,
  hasPodDrag,
  indexFilesById,
  indexFilesByParentId,
  insertEntryAt,
  isDropTargetFolder,
  isPodFolder,
  isTriggeredConversation,
  mockAgents,
  moveDataSource,
  parseEntryKey,
  readDragId,
  readEntryDragKey,
  removeEntry,
  SIDEBAR_ENTRY_DRAG_MIME,
  type SidebarEntry,
  mockUsers,
  MY_POD_SPACE,
  POD_NOTIFICATION_OPTIONS,
  type PodNotificationCondition,
  type RequestOutcome,
  type Space,
  type Trigger,
  type TriggerPool,
  type User,
  type WakeUp,
  type WorkspaceModel,
  type WorkspaceProfile,
} from "../data";
import {
  getDataSourceIcon,
  getFileTypeLabel,
  getFolderPath,
  getIconForFileType,
  getItemLocations,
  isDataSourceFolder,
  ROOT_FOLDER_ICON,
  ROOT_FOLDER_LABEL,
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

/**
 * What Automated work shows: the runs themselves, the triggers that start them,
 * or the wake-ups agents set for themselves inside a conversation.
 */
type AutomatedWorkTab = "conversations" | "triggers" | "wakeups";

/** A kept sidebar entry, resolved to what it stands for. */
type KeptItem = { key: string; entry: SidebarEntry } & (
  | { kind: "pod"; space: Space }
  | { kind: "file"; item: DataSource }
  | { kind: "agent"; agent: Agent }
);

type PodTabsState = {
  mainTabOrder: string[];
  dynamicFileTabs: DynamicFileTab[];
};

/**
 * How many Pods the sidebar keeps. The workspace holds sixty; someone who has
 * been here a while is in a good number of them, and the list should look it.
 */
const SIDEBAR_POD_COUNT = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSpaceActivity(space: Space) {
  const c = space.id.charCodeAt(space.id.length - 1);
  const count = c % 3 === 0 ? (c % 9) + 1 : undefined;
  return { count, hasActivity: count ? true : c % 2 !== 0 };
}

/** Busiest first, then the ones with something new, then by name. */
function compareSpacesByActivity(a: Space, b: Space): number {
  const { count: cA = 0, hasActivity: hA } = getSpaceActivity(a);
  const { count: cB = 0, hasActivity: hB } = getSpaceActivity(b);
  if (cA !== cB) {
    return cB - cA;
  }
  if (hA !== hB) {
    return hA ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/** Where the drop will land: a line drawn between two kept rows. */
function DropIndicator({ edge }: { edge: "top" | "bottom" }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-highlight-500",
        edge === "top" ? "-top-px" : "-bottom-px"
      )}
    />
  );
}

/** A file as the input bar holds it, when a conversation is started on one. */
function fileAttachment(file: DataSource): InputBarAttachment {
  return {
    id: file.id,
    label: file.fileName,
    tooltip: file.fileName,
    visual: getDataSourceIcon(file),
  };
}

/** The collaborators strip: a few of the workspace's agents, and some people. */
function pickCollaborators(
  model: WorkspaceModel,
  currentUserId: string
): Collaborator[] {
  const agents = model.agents
    .filter((agent) => agent.status === "active")
    .slice(0, 3)
    .map((data) => ({ type: "agent" as const, data }));
  const people = mockUsers
    .filter((person) => person.id !== currentUserId)
    .slice(0, 3)
    .map((data) => ({ type: "person" as const, data }));
  return [...agents, ...people];
}

// ── Workspace view ────────────────────────────────────────────────────────────

interface WorkspaceViewProps {
  model: WorkspaceModel;
  user: User;
  onProfileChange: (profile: WorkspaceProfile) => void;
}

function WorkspaceView({ model, user, onProfileChange }: WorkspaceViewProps) {
  // ── Bootstrap state ───────────────────────────────────────────────────────
  // Everything below starts from the workspace model. The story is remounted
  // when the simulated workspace changes, so these only need an initial value.
  const [greeting] = useState(() => getRandomGreetingForName(user.firstName));
  const [spaces, setSpaces] = useState<Space[]>(model.pods);
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    Conversation[]
  >(model.conversations);
  const [collaborators] = useState<Collaborator[]>(() =>
    pickCollaborators(model, user.id)
  );

  // ── Navigation state ──────────────────────────────────────────────────────
  // P2 selection: what's shown in the "level 1" panel
  type P2View =
    /** The new-conversation screen, holding the file it was started on. */
    | { kind: "welcome"; attachment?: InputBarAttachment }
    | { kind: "inboxAlt" }
    | { kind: "files" }
    /** A file the sidebar keeps, opened in place of the main content rather
     *  than beside the Hub. */
    | { kind: "file"; dataSource: DataSource }
    /** An agent the sidebar keeps, read as the conversations held with it. */
    | { kind: "agent"; agentId: string }
    | { kind: "requests" }
    | { kind: "conversations" }
    | { kind: "automations" }
    | { kind: "conversation"; conversationId: string }
    | { kind: "space"; spaceId: string }
    | { kind: "profile" }
    | { kind: "templates" }
    | { kind: "build"; section: BuildSection };

  const [p2View, setP2View] = useState<P2View>({ kind: "inboxAlt" });

  // P3: conversation from a space (level 2), a file opened from a pod's
  // files screen, or a side panel opened from the level-1 conversation.
  type P3View =
    | { kind: "conversation"; conversationId: string }
    | { kind: "request"; requestId: string }
    | { kind: "newConversation"; podName?: string }
    | SidePanelView;

  const [p3View, setP3View] = useState<P3View | null>(null);

  // P4: side panel opened from a level-2 conversation.
  const [p4View, setP4View] = useState<SidePanelView | null>(null);

  const openNewConversation = (podName?: string) => {
    setP3View({ kind: "newConversation", podName });
    setP4View(null);
  };

  /** The sidebar's New button: a conversation about nothing in particular. */
  const startNewConversation = () => {
    setP2View({ kind: "welcome" });
    setP3View(null);
    setP4View(null);
  };

  /** The same screen, with a file from the Hub already in hand. Kept apart
   *  from `startNewConversation` so neither takes an optional argument an
   *  `onClick` could fill with its event. */
  const startConversationOn = (file: DataSource) => {
    setP2View({ kind: "welcome", attachment: fileAttachment(file) });
    setP3View(null);
    setP4View(null);
  };

  // ── Space panel tab state (lifted from GroupConversationView) ────────────
  const [spaceActiveTab, setSpaceActiveTab] = useState("conversations");
  const [requestsActiveTab, setRequestsActiveTab] =
    useState<RequestsTab>("pending");
  const [automatedWorkTab, setAutomatedWorkTab] =
    useState<AutomatedWorkTab>("conversations");
  const [triggers, setTriggers] = useState<Trigger[]>(model.triggers);
  // A run that already happened is history: switching its trigger off or moving
  // it to another pool does not rewrite it. Keeping these conversations in
  // state rather than deriving them from `triggers` is what stops a toggle from
  // rebuilding every list that shows a conversation.
  const [triggeredConversations] = useState<Conversation[]>(
    model.triggeredConversations
  );
  const [wakeUps, setWakeUps] = useState<WakeUp[]>(model.wakeUps);
  // The inbox rows you have read, conversations and requests alike. Ones read
  // during a visit to the Inbox keep their place there; the next visit starts
  // without them.
  const [readRowIds, setReadRowIds] = useState<Set<string>>(new Set());
  // Rows put back to unread from a row's menu, which outranks whether the
  // conversation itself has anything new in it. A row is in one set or the
  // other, never both.
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(new Set());
  // Conversations you have left. They are gone from every list that draws on
  // `allConversations`, which is all of them.
  const [leftConversationIds, setLeftConversationIds] = useState<Set<string>>(
    new Set()
  );
  // The workspace's files, mutable from here on: dragging something into
  // another folder rewrites this list, and every view that reads files reads it
  // through the indexes derived below.
  const [files, setFiles] = useState<DataSource[]>(model.files);
  // Owned here because the Files screen's search input sits in the panel's top
  // bar, next to the screen title, rather than inside the browser.
  const [filesSearchText, setFilesSearchText] = useState("");
  const [requests, setRequests] = useState<AdminRequest[]>(model.requests);
  // Requests handled since the list was last refreshed. They stay in Pending,
  // showing their outcome, instead of vanishing under the cursor.
  const [stickyRequestIds, setStickyRequestIds] = useState<Set<string>>(
    new Set()
  );
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
  const [activeTab, setActiveTab] = useState<"chat" | "build" | "admin">(
    "chat"
  );
  // Which Build row is highlighted. Only three of them have a screen, so this
  // outlives `p2View` — a Space stays lit without the panel changing.
  const [buildNavItem, setBuildNavItem] = useState("agents");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isKeptAgentAboutOpen, setIsKeptAgentAboutOpen] = useState(false);
  const [spaceNotificationPreferences, setSpaceNotificationPreferences] =
    useState<Map<string, PodNotificationCondition>>(new Map());

  const updateSpaceNotificationPreference = (
    spaceId: string,
    condition: PodNotificationCondition
  ) => {
    setSpaceNotificationPreferences((prev) =>
      new Map(prev).set(spaceId, condition)
    );
  };
  // Everything the sidebar keeps, in the order the user put it there: Pods,
  // files, folders and agents in one list. Something shows there because it was
  // put there, not because the user takes part in it. Every other Pod is
  // reached from the browse menu or from the Hub.
  const [sidebarEntries, setSidebarEntries] = useState<SidebarEntry[]>(() => {
    const kept = new Set(model.memberPodIds.slice(0, SIDEBAR_POD_COUNT));
    return model.pods
      .filter((pod) => kept.has(pod.id))
      .sort(compareSpacesByActivity)
      .map((pod) => ({ kind: "pod" as const, spaceId: pod.id }));
  });
  // A Pod the user creates is theirs; the workspace's others stay out of the
  // Inbox until they are in them.
  const otherPodIds = useMemo(() => {
    const memberPodIds = new Set(model.memberPodIds);
    return new Set(
      model.pods.map((pod) => pod.id).filter((id) => !memberPodIds.has(id))
    );
  }, [model]);
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
  /** The folder the create dialog opens on, when asked for from Files. */
  const [createPodParentId, setCreatePodParentId] = useState<string | null>(
    null
  );
  /** A tool opens in its own sheet rather than a panel, the way Build shows it. */
  const [detailedToolId, setDetailedToolId] = useState<string | null>(null);
  /**
   * Where a drop would land in the kept list, counted on the rows as they are
   * drawn: 0 is above the first, `length` below the last. Null when nothing is
   * being dragged over it.
   */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Where the Hub is. Held here so a kept folder can open the Hub on itself
  // and stay lit while the Hub is in it. It starts in the company drive: the
  // top level holds only the two drives, which is nothing to read.
  const [hubFolderId, setHubFolderId] = useState<string | null>(
    () =>
      model.files.find(
        (file) => file.folderType === "drive" && file.source === "company"
      )?.id ?? null
  );
  /** The row "Show in the Hub" points at, lit until the Hub moves on. */
  const [hubRevealedFileId, setHubRevealedFileId] = useState<string | null>(
    null
  );
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
  // Everything below is read off `files`, so moving an item rewrites one list
  // and every surface that shows it follows.
  const filesById = useMemo(() => indexFilesById(files), [files]);
  const filesByParentId = useMemo(() => indexFilesByParentId(files), [files]);

  const podFilesBySpaceId = useMemo(
    () =>
      deriveFolderFiles(
        filesByParentId,
        files.filter((file) => file.folderType === "pod"),
        { skipSystemFolders: true }
      ),
    [files, filesByParentId]
  );

  const conversationFilesByConversationId = useMemo(
    () =>
      deriveFolderFiles(
        filesByParentId,
        files.filter((file) => file.folderType === "conversation")
      ),
    [files, filesByParentId]
  );

  // Where each agent and skill is filed, so Build reports the move a drag in
  // the file system just made.
  const itemLocations = useMemo(() => getItemLocations(files), [files]);

  // A Pod's files come from the workspace, so its Files tab and the file
  // system's tree are looking at the very same items.
  const podFilesFor = useCallback(
    (spaceId: string) => podFilesBySpaceId.get(spaceId) ?? [],
    [podFilesBySpaceId]
  );

  const handleMoveFile = useCallback(
    (draggedId: string, targetFolderId: string | null) => {
      if (!canDropInto(filesById, draggedId, targetFolderId)) {
        return;
      }
      setFiles((prev) => moveDataSource(prev, draggedId, targetFolderId));
    },
    [filesById]
  );

  // Automated work is nothing but the runs of your triggers, so it joins the
  // conversations from the trigger list rather than from a coin flip.
  const allConversations = useMemo(
    () =>
      [...conversationsWithMessages, ...triggeredConversations].filter(
        (conversation) => !leftConversationIds.has(conversation.id)
      ),
    [conversationsWithMessages, leftConversationIds, triggeredConversations]
  );

  const memberSpaces = useMemo(
    () => spaces.filter((space) => !otherPodIds.has(space.id)),
    [otherPodIds, spaces]
  );

  const unreadCount = useMemo(() => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    return allConversations.filter((conv) => {
      if (!conv.spaceId || otherPodIds.has(conv.spaceId)) return false;
      return conv.updatedAt >= twoDaysAgo;
    }).length;
  }, [allConversations, otherPodIds]);

  const sortedSpaces = useMemo(
    () => [...spaces].sort(compareSpacesByActivity),
    [spaces]
  );

  const spacesById = useMemo(
    () => new Map(spaces.map((space) => [space.id, space])),
    [spaces]
  );

  const keptEntryKeys = useMemo(
    () => new Set(sidebarEntries.map(entryKey)),
    [sidebarEntries]
  );

  const isEntryKept = useCallback(
    (entry: SidebarEntry | null) =>
      entry !== null && keptEntryKeys.has(entryKey(entry)),
    [keptEntryKeys]
  );

  /**
   * Each kept entry with the thing it stands for. Read through the live
   * indexes, so a kept item follows a rename or a move and simply stops being
   * listed once it is deleted.
   */
  const keptItems = useMemo<KeptItem[]>(
    () =>
      sidebarEntries.flatMap<KeptItem>((entry) => {
        const key = entryKey(entry);
        switch (entry.kind) {
          case "pod": {
            const space = spacesById.get(entry.spaceId);
            return space ? [{ key, entry, kind: "pod", space }] : [];
          }
          case "file": {
            const item = filesById.get(entry.fileId);
            return item ? [{ key, entry, kind: "file", item }] : [];
          }
          case "agent": {
            const agent = getAgentById(entry.agentId);
            return agent ? [{ key, entry, kind: "agent", agent }] : [];
          }
        }
      }),
    [filesById, sidebarEntries, spacesById]
  );

  const keptAgentCollaborator = useMemo((): Collaborator | null => {
    if (p2View.kind !== "agent") {
      return null;
    }
    const agent = getAgentById(p2View.agentId);
    return agent ? { type: "agent", data: agent } : null;
  }, [p2View]);

  /**
   * An agent nobody has written to yet is given an invented history, and
   * opening one of those conversations makes it real — at which point the
   * generator steps aside and the list would collapse to the single
   * conversation you just clicked. So each agent keeps the history it was
   * first handed, however much the pool moves underneath it.
   */
  const agentConversationsByAgentId = useRef(new Map<string, Conversation[]>());

  const keptAgentConversations = useMemo(() => {
    if (!keptAgentCollaborator) {
      return [];
    }
    const agentId = keptAgentCollaborator.data.id;
    const frozen = agentConversationsByAgentId.current.get(agentId);
    if (frozen) {
      return frozen;
    }
    const conversations = getCollaboratorConversations(
      allConversations,
      user.id,
      keptAgentCollaborator
    );
    agentConversationsByAgentId.current.set(agentId, conversations);
    return conversations;
  }, [allConversations, keptAgentCollaborator, user.id]);

  /** The Pod you are in while it is not kept: the selection needs a row. */
  const openUnkeptSpace = useMemo(() => {
    if (p2View.kind !== "space") {
      return null;
    }
    if (isEntryKept({ kind: "pod", spaceId: p2View.spaceId })) {
      return null;
    }
    return spacesById.get(p2View.spaceId) ?? null;
  }, [isEntryKept, p2View, spacesById]);

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

  const p3Request = useMemo(
    () =>
      p3View?.kind === "request"
        ? (requests.find((r) => r.id === p3View.requestId) ?? null)
        : null,
    [p3View, requests]
  );

  const pendingRequestCount = requests.filter(
    (r) => r.status === "pending"
  ).length;

  // Handling a request records the decision and the decision maker. The row is
  // now Done, but it is pinned to Pending until the list is refreshed.
  const handleResolveRequest = useCallback(
    (requestId: string, outcome: RequestOutcome, note?: string) => {
      setRequests((prev) =>
        prev.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: "done" as const,
                outcome,
                resolvedByUserId: user?.id,
                resolvedAt: new Date(),
                resolutionMessage: note,
              }
            : request
        )
      );
      setStickyRequestIds((prev) => new Set(prev).add(requestId));
    },
    [user?.id]
  );

  // Switching tabs is a refresh: handled rows drop out of Pending.
  const handleRequestsTabChange = useCallback((tab: RequestsTab) => {
    setRequestsActiveTab(tab);
    setStickyRequestIds(new Set());
  }, []);

  const handleClearHandledRequests = useCallback(() => {
    setStickyRequestIds(new Set());
  }, []);

  const handleRowsRead = useCallback((rowIds: string[]) => {
    setReadRowIds((prev) => new Set([...prev, ...rowIds]));
    setUnreadRowIds((prev) => {
      const next = new Set(prev);
      rowIds.forEach((rowId) => next.delete(rowId));
      return next;
    });
  }, []);

  const handleRowsUnread = useCallback((rowIds: string[]) => {
    setReadRowIds((prev) => {
      const next = new Set(prev);
      rowIds.forEach((rowId) => next.delete(rowId));
      return next;
    });
    setUnreadRowIds((prev) => new Set([...prev, ...rowIds]));
  }, []);

  // Leaving a conversation takes it out of every list, and closes it if you
  // were looking at it.
  const handleLeaveConversation = useCallback((conversationId: string) => {
    setLeftConversationIds((prev) => new Set([...prev, conversationId]));
    setP3View((prev) =>
      prev?.kind === "conversation" && prev.conversationId === conversationId
        ? null
        : prev
    );
    setP4View(null);
  }, []);

  const handleToggleTrigger = useCallback(
    (triggerId: string, enabled: boolean) => {
      setTriggers((prev) =>
        prev.map((trigger) =>
          trigger.id === triggerId
            ? { ...trigger, status: enabled ? "enabled" : "disabled" }
            : trigger
        )
      );
    },
    []
  );

  const handleSetTriggerPool = useCallback(
    (triggerId: string, pool: TriggerPool) => {
      setTriggers((prev) =>
        prev.map((trigger) =>
          trigger.id === triggerId ? { ...trigger, pool } : trigger
        )
      );
    },
    []
  );

  // A wake-up has no off switch: dismissing it is the end of it.
  const handleDismissWakeUp = useCallback((wakeUpId: string) => {
    setWakeUps((prev) => prev.filter((wakeUp) => wakeUp.id !== wakeUpId));
  }, []);

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

      const file = podFilesFor(podContext.spaceId).find(
        (item) => item.id === dataSourceId
      );
      if (!file) {
        return File02;
      }

      return getDataSourceIcon(file) ?? File02;
    },
    [podContext, podFilesFor]
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

      const file = podFilesFor(podContext.spaceId).find(
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

  const handlePodTabRename = useCallback(
    (tabValue: string, title: string) => {
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
            tab.value === tabValue ? { ...tab, label: title } : tab
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
    return podFilesFor(podContext.spaceId).filter(
      (item) => item.kind === "file" && !pinnedIds.has(item.id)
    );
  }, [dynamicFileTabIds, podContext, podFilesFor]);

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
  /** Every folder a Pod may be created in; the picker nests them itself. */
  const podDestinations = useMemo(() => {
    const options: PodDestination[] = [];
    for (const file of files) {
      if (!isDropTargetFolder(file) || isPodFolder(file)) {
        continue;
      }
      const path = getFolderPath(filesById, file.id);
      if (path.some(isPodFolder)) {
        continue;
      }
      options.push({
        id: file.id,
        name: file.fileName,
        parentId: file.parentId,
        path: path.map((folder) => folder.fileName).join(" / "),
        icon: getDataSourceIcon(file),
      });
    }
    return options;
  }, [files, filesById]);

  /**
   * Where a Pod goes when no folder was named: the shared drive, found by what
   * it is rather than by its id, so renaming it changes nothing here.
   */
  const defaultPodDestinationId = useMemo(() => {
    const companyDrive = files.find(
      (file) => file.folderType === "drive" && file.source === "company"
    );
    return companyDrive?.id ?? podDestinations[0]?.id ?? null;
  }, [files, podDestinations]);

  /** Kept from a menu rather than dropped, so it goes to the end of the list. */
  const keepEntry = useCallback((entry: SidebarEntry) => {
    setSidebarEntries((prev) =>
      hasEntry(prev, entry) ? prev : [...prev, entry]
    );
  }, []);

  const dropEntry = useCallback((entry: SidebarEntry) => {
    setSidebarEntries((prev) => removeEntry(prev, entry));
  }, []);

  const toggleEntry = useCallback((entry: SidebarEntry) => {
    setSidebarEntries((prev) =>
      hasEntry(prev, entry) ? removeEntry(prev, entry) : [...prev, entry]
    );
  }, []);

  const addPodToSidebar = useCallback(
    (spaceId: string) => keepEntry({ kind: "pod", spaceId }),
    [keepEntry]
  );

  /** Opens the create dialog with a folder already chosen. */
  const handleCreatePodIn = useCallback((parentId: string | null) => {
    setCreatePodParentId(parentId);
    setIsCreateRoomDialogOpen(true);
  }, []);

  /** A Pod folder stands for a Pod: opening it leaves Files for that Pod. */
  const handleOpenPod = useCallback((folder: DataSource) => {
    if (!folder.refId) {
      return;
    }
    setP2View({ kind: "space", spaceId: folder.refId });
    setP3View(null);
    setP4View(null);
  }, []);

  /** A conversation folder opens its conversation beside the Hub, the way
   *  the Hub's files open. */
  const handleOpenConversation = useCallback((folder: DataSource) => {
    if (!folder.refId) {
      return;
    }
    setP3View({ kind: "conversation", conversationId: folder.refId });
    setP4View(null);
  }, []);

  /** An agent or a skill file opens where it is edited, which is its Build
   *  detail panel rather than a document preview. */
  const handleEditBuildItem = useCallback((file: DataSource) => {
    setP3View(fileSidePanelView(file));
    setP4View(null);
  }, []);

  /** Everything addressable, in one list for the palette to narrow. */
  const paletteItems = useMemo((): CommandPaletteItem[] => {
    const podItems = spaces.map((space) => ({
      id: `pod-${space.id}`,
      group: "Pods",
      label: space.name,
      description: space.description || undefined,
      icon: Cube01,
      onSelect: () => {
        setP2View({ kind: "space", spaceId: space.id });
        setP3View(null);
        setP4View(null);
      },
    }));

    const conversationItems = allConversations.map((conversation) => ({
      id: `conversation-${conversation.id}`,
      group: "Conversations",
      label: conversation.title,
      icon: MessageChatSquare,
      onSelect: () => {
        setP2View({
          kind: "conversation",
          conversationId: conversation.id,
        });
        setP3View(null);
        setP4View(null);
      },
    }));

    const fileItems = files
      .filter((file) => !isDataSourceFolder(file))
      .map((file) => ({
        id: `file-${file.id}`,
        group: ROOT_FOLDER_LABEL,
        label: file.fileName,
        // From the parent: the walk starts at a folder, and a file is not one.
        description: getFolderPath(filesById, file.parentId)
          .map((folder) => folder.fileName)
          .join(" / "),
        icon: getDataSourceIcon(file),
        avatar: file.avatar,
        onSelect: () => {
          setP2View({ kind: "files" });
          setP3View(fileSidePanelView(file));
          setP4View(null);
        },
      }));

    return [...podItems, ...conversationItems, ...fileItems];
  }, [spaces, allConversations, files, filesById]);

  useSidebarShortcuts({
    onNewConversation: startNewConversation,
    onOpenSearch: () => setIsPaletteOpen(true),
  });

  /**
   * The create menu, for everything that is a file of its own. An agent, a
   * skill and a tool are made in Build and filed here, so creating one makes
   * the Build item first and files what it stands for; a website and a
   * database are nothing but files. Either way the new file opens straight
   * away, since an untitled empty one is only worth making to work on it.
   */
  const handleCreateFile = useCallback(
    (fileType: CreatableFileType, parentId: string | null) => {
      const name = `Untitled ${getFileTypeLabel(fileType)}`;
      const refId =
        fileType === "agent"
          ? createManagedAgent(name, user.id).id
          : fileType === "skill"
            ? createManagedSkill(name, user.id).id
            : fileType === "tool"
              ? createMockTool(name, user.id).id
              : undefined;

      const file: DataSource = {
        id: `fs-created-${fileType}-${Date.now()}`,
        kind: "file",
        fileName: `${name}.${fileType}`,
        parentId,
        // A new file belongs to the drive it was made in.
        source:
          (parentId ? filesById.get(parentId)?.source : undefined) ?? "company",
        fileType,
        refId,
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        icon: getIconForFileType(fileType),
      };
      setFiles((prev) => [...prev, file]);

      if (fileType === "tool") {
        setDetailedToolId(refId ?? null);
        return;
      }
      setP3View(fileSidePanelView(file));
      setP4View(null);
    },
    [filesById, user.id]
  );

  const handleRoomNameNext = (
    name: string,
    isPublic: boolean,
    destinationId?: string | null
  ) => {
    // Built inline rather than through `createSpace`, which pushes into the
    // shared mock list the seeded workspace draws its Pods from.
    const newSpace: Space = {
      id: `space-created-${Date.now()}`,
      name,
      description: `Room for ${name}`,
      isPublic,
    };
    const parentId = destinationId ?? null;

    setSpaces((prev) => [...prev, newSpace]);
    setSpacePublicSettings((prev) => new Map(prev).set(newSpace.id, isPublic));
    // A new Pod shows up in Files straight away, where it was asked for.
    setFiles((prev) => [
      ...prev,
      {
        id: `fs-pod-${newSpace.id}`,
        kind: "folder",
        fileName: name,
        parentId,
        source: "pod",
        folderType: "pod",
        refId: newSpace.id,
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    addPodToSidebar(newSpace.id);
    setLastCreatedSpaceId(newSpace.id);
    setIsCreateRoomDialogOpen(false);
    setCreatePodParentId(null);
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

  /** A kept folder opens the Hub on itself; a kept file takes the main panel.
   *  A tool is the exception: what there is of one is its settings sheet. */
  const openPinnedItem = (item: DataSource) => {
    setP3View(null);
    setP4View(null);
    if (isDataSourceFolder(item)) {
      setHubFolderId(item.id);
      setP2View({ kind: "files" });
      return;
    }
    if (item.fileType === "tool" && item.refId) {
      setDetailedToolId(item.refId);
      return;
    }
    setP2View({ kind: "file", dataSource: item });
  };

  /** Opens the Hub where a kept item sits rather than inside it, and points at
   *  its row. For a folder that is the step a plain click skips. */
  const showPinnedItemInHub = (item: DataSource) => {
    setHubFolderId(item.parentId);
    setHubRevealedFileId(item.id);
    setFilesSearchText("");
    setP2View({ kind: "files" });
    setP3View(null);
    setP4View(null);
  };

  // The row stays lit only while the Hub still shows it, so leaving the Hub or
  // opening another folder from the tree lets it go.
  if (
    hubRevealedFileId &&
    (p2View.kind !== "files" ||
      filesById.get(hubRevealedFileId)?.parentId !== hubFolderId)
  ) {
    setHubRevealedFileId(null);
  }

  /** Opens the Hub on an agent's own file, which is where it is filed. */
  const showAgentInHub = (agentId: string) => {
    const file = files.find(
      (candidate) =>
        candidate.fileType === "agent" && candidate.refId === agentId
    );
    if (file) {
      showPinnedItemInHub(file);
    }
  };

  /** Picks the row up by its entry, so a drop knows what it is carrying. */
  const entryDragProps = (
    entry: SidebarEntry,
    preview: {
      label: string;
      icon?: ComponentType<{ className?: string }>;
      avatar?: AvatarData;
    }
  ) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(SIDEBAR_ENTRY_DRAG_MIME, entryKey(entry));
      event.dataTransfer.setData("text/plain", preview.label);
      setDragPreview(event, preview);
    },
    onDragEnd: () => setDropIndex(null),
  });

  const renderSidebarFileNavItem = (item: DataSource, entry: SidebarEntry) => (
    <NavigationListItem
      key={item.id}
      label={item.fileName}
      // A skill reads by its avatar, as it does in the Hub.
      icon={item.avatar ? undefined : (getDataSourceIcon(item) ?? File02)}
      avatar={item.avatar ? <Avatar size="xxs" {...item.avatar} /> : undefined}
      selected={
        isDataSourceFolder(item)
          ? p2View.kind === "files" && hubFolderId === item.id
          : p2View.kind === "file" && p2View.dataSource.id === item.id
      }
      onClick={() => openPinnedItem(item)}
      {...entryDragProps(entry, {
        label: item.fileName,
        icon: getDataSourceIcon(item) ?? File02,
        avatar: item.avatar,
      })}
      moreMenu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <NavigationListItemAction />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Show in the Hub"
              icon={ROOT_FOLDER_ICON}
              onClick={(e) => {
                e.stopPropagation();
                showPinnedItemInHub(item);
              }}
            />
            <DropdownMenuItem
              label="Remove from sidebar"
              icon={Star01}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dropEntry(entry);
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );

  const renderSidebarAgentNavItem = (agent: Agent, entry: SidebarEntry) => {
    const avatar: AvatarData = {
      emoji: agent.emoji,
      backgroundColor: agent.backgroundColor,
    };
    return (
      <NavigationListItem
        key={agent.id}
        label={agent.name}
        avatar={<Avatar size="xxs" {...avatar} />}
        selected={p2View.kind === "agent" && p2View.agentId === agent.id}
        onClick={() => {
          setP2View({ kind: "agent", agentId: agent.id });
          setP3View(null);
          setP4View(null);
        }}
        {...entryDragProps(entry, { label: agent.name, avatar })}
        moreMenu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NavigationListItemAction />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Show in the Hub"
                icon={ROOT_FOLDER_ICON}
                onClick={(e) => {
                  e.stopPropagation();
                  showAgentInHub(agent.id);
                }}
              />
              <DropdownMenuItem
                label="Remove from sidebar"
                icon={Star01}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropEntry(entry);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    );
  };

  /**
   * Which gap the pointer sits in, counted on the rows as drawn. Measured from
   * the rows themselves rather than from the list, so a collapsed section or a
   * scrolled sidebar needs no special case.
   */
  const dropIndexAt = (container: HTMLElement, clientY: number): number => {
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-kept-entry]")
    );
    const above = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return above === -1 ? rows.length : above;
  };

  /** Only `types` is readable during dragover, so this is the hover test. */
  const isKeepableDrag = (dataTransfer: DataTransfer) =>
    hasEntryDrag(dataTransfer) ||
    hasPodDrag(dataTransfer) ||
    hasFileDrag(dataTransfer);

  /** What the drag is carrying: a row of the list, or an item from the Hub. */
  const readKeptDrag = (dataTransfer: DataTransfer): SidebarEntry | null => {
    const key = readEntryDragKey(dataTransfer);
    if (key) {
      return parseEntryKey(key);
    }
    const draggedId = readDragId(dataTransfer);
    const item = draggedId ? filesById.get(draggedId) : undefined;
    return item ? entryForDataSource(item) : null;
  };

  const handleKeptDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isKeepableDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(dropIndexAt(event.currentTarget, event.clientY));
  };

  const handleKeptDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving between the rows inside the section is not leaving it.
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setDropIndex(null);
  };

  const handleKeptDrop = (event: DragEvent<HTMLDivElement>) => {
    const index = dropIndex ?? dropIndexAt(event.currentTarget, event.clientY);
    setDropIndex(null);
    const entry = readKeptDrag(event.dataTransfer);
    if (!entry) {
      return;
    }
    event.preventDefault();
    setSidebarEntries((prev) => insertEntryAt(prev, entry, index));
  };

  const handleUpdateSpacePublic = (spaceId: string, isPublic: boolean) => {
    setSpacePublicSettings((prev) => new Map(prev).set(spaceId, isPublic));
    setSpaces((prev) =>
      prev.map((s) => (s.id === spaceId ? { ...s, isPublic } : s))
    );
  };

  const renderPodNavItem = (space: Space) => {
    const entry: SidebarEntry = { kind: "pod", spaceId: space.id };
    const isFavorite = isEntryKept(entry);
    const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
    const icon = isRestricted ? CubeOutline : Cube01;
    const { count, hasActivity } = getSpaceActivity(space);
    const members = getMembersBySpaceId(space.id)
      .map((id) => getUserById(id))
      .filter((u): u is User => u != null);

    return (
      <NavigationListItem
        key={space.id}
        label={space.name}
        icon={icon}
        selected={p2View.kind === "space" && p2View.spaceId === space.id}
        count={count}
        hasActivity={hasActivity}
        // Only a kept Pod can be reordered; the open one is just passing through.
        {...(isFavorite
          ? entryDragProps(entry, { label: space.name, icon })
          : {})}
        moreMenu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NavigationListItemAction />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label={
                  isFavorite ? "Remove from sidebar" : "Keep in the sidebar"
                }
                icon={Star01}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleEntry(entry);
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
                    value={
                      spaceNotificationPreferences.get(space.id) ??
                      DEFAULT_POD_NOTIFICATION_CONDITION
                    }
                    onValueChange={(v) =>
                      updateSpaceNotificationPreference(
                        space.id,
                        v as PodNotificationCondition
                      )
                    }
                  >
                    {POD_NOTIFICATION_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        label={option.label}
                      />
                    ))}
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

  const renderKeptItem = (kept: KeptItem) => {
    switch (kept.kind) {
      case "pod":
        return renderPodNavItem(kept.space);
      case "file":
        return renderSidebarFileNavItem(kept.item, kept.entry);
      case "agent":
        return renderSidebarAgentNavItem(kept.agent, kept.entry);
    }
  };

  // ── P2 content ────────────────────────────────────────────────────────────
  // What the three Build screens are called and badged with, in one place: the
  // sidebar row, the breadcrumb and the panel label all read from it.
  const BUILD_SECTION_DISPLAY: Record<
    BuildSection,
    { label: string; icon: ComponentType }
  > = {
    agents: { label: "Agents", icon: Robot },
    skills: { label: "Skills", icon: PuzzlePiece01 },
    tools: { label: "Tools", icon: ShapesPlus },
  };

  const p2Label = (() => {
    if (p2View.kind === "build")
      return BUILD_SECTION_DISPLAY[p2View.section].label;
    if (p2View.kind === "inboxAlt") return "Inbox";
    if (p2View.kind === "files") return ROOT_FOLDER_LABEL;
    if (p2View.kind === "file") return p2View.dataSource.fileName;
    if (p2View.kind === "agent")
      return getAgentById(p2View.agentId)?.name ?? "Agent";
    if (p2View.kind === "requests") return "Requests";
    if (p2View.kind === "conversations") return "Free conversations";
    if (p2View.kind === "automations") return "Automated work";
    if (podContext) return podContext.space.name;
    if (p2View.kind === "conversation")
      return selectedConversation?.title ?? "Conversation";
    if (p2View.kind === "profile") return "Profile";
    if (p2View.kind === "templates") return "Templates";
    return "Home";
  })();

  const p2Content = (() => {
    if (p2View.kind === "build") {
      if (p2View.section === "agents")
        return (
          <ManageAgentsView
            currentUserId={user.id}
            agents={model.agents}
            locations={itemLocations}
            onOpenAgent={(agentId) => {
              setP3View({ kind: "agent", agentId });
              setP4View(null);
            }}
          />
        );
      if (p2View.section === "skills")
        return (
          <ManageSkillsView
            currentUserId={user.id}
            skills={model.skills}
            locations={itemLocations}
            onOpenSkill={(skillId) => {
              setP3View({ kind: "skill", skillId });
              setP4View(null);
            }}
          />
        );
      return <ManageToolsView />;
    }
    if (p2View.kind === "profile") return <ProfilePanel user={user} />;
    if (p2View.kind === "inboxAlt")
      return (
        <InboxAltView
          spaces={memberSpaces}
          onNewConversation={openNewConversation}
          conversations={allConversations}
          requests={requests}
          triggers={triggers}
          currentUserId={user.id}
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
          selectedRequestId={
            p3View?.kind === "request" ? p3View.requestId : null
          }
          readRowIds={readRowIds}
          onRowsRead={handleRowsRead}
          unreadRowIds={unreadRowIds}
          onRowsUnread={handleRowsUnread}
          onLeaveConversation={handleLeaveConversation}
          onConversationClick={(conversation) => {
            setP3View({
              kind: "conversation",
              conversationId: conversation.id,
            });
            setP4View(null);
          }}
          onRequestClick={(request) => {
            setP3View({ kind: "request", requestId: request.id });
            setP4View(null);
          }}
        />
      );
    if (p2View.kind === "files")
      return (
        <WorkspaceFileSystem
          files={files}
          filesByParentId={filesByParentId}
          filesById={filesById}
          searchText={filesSearchText}
          onSearchTextChange={setFilesSearchText}
          onMoveFile={handleMoveFile}
          onCreatePod={handleCreatePodIn}
          onCreateFile={handleCreateFile}
          onFileOpen={(dataSource) => {
            setP3View(fileSidePanelView(dataSource));
            setP4View(null);
          }}
          onOpenConversation={handleOpenConversation}
          onStartConversation={startConversationOn}
          onOpenPod={handleOpenPod}
          onEditBuildItem={handleEditBuildItem}
          currentFolderId={hubFolderId}
          onCurrentFolderIdChange={setHubFolderId}
          isPinnedToSidebar={(item) => isEntryKept(entryForDataSource(item))}
          onTogglePinnedToSidebar={(item) => {
            const entry = entryForDataSource(item);
            if (entry) {
              toggleEntry(entry);
            }
          }}
          revealedFileId={hubRevealedFileId}
          onClearRevealedFile={() => setHubRevealedFileId(null)}
        />
      );
    if (p2View.kind === "file")
      return fileSidePanelContent(fileSidePanelView(p2View.dataSource));
    if (p2View.kind === "agent" && keptAgentCollaborator)
      return (
        <PersonAgentView
          collaborator={keptAgentCollaborator}
          user={user}
          conversations={keptAgentConversations}
          users={mockUsers}
          agents={model.agents}
          aboutOpen={isKeptAgentAboutOpen}
          onAboutOpenChange={setIsKeptAgentAboutOpen}
          onConversationClick={(conversation) => {
            // The list stands in a history of its own when the agent has none,
            // so the conversation has to join the pool before it can open.
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
    if (p2View.kind === "requests")
      return (
        <RequestsView
          requests={requests}
          activeTab={requestsActiveTab}
          onTabChange={handleRequestsTabChange}
          stickyRequestIds={stickyRequestIds}
          onClearHandled={handleClearHandledRequests}
          currentUserId={user?.id}
          selectedRequestId={
            p3View?.kind === "request" ? p3View.requestId : null
          }
          readRowIds={readRowIds}
          onRowsRead={handleRowsRead}
          onRequestClick={(request) => {
            setP3View({ kind: "request", requestId: request.id });
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
    if (p2View.kind === "automations") {
      if (automatedWorkTab === "triggers")
        return (
          <TriggersManageView
            triggers={triggers}
            currentUserId={user.id}
            onToggleTrigger={handleToggleTrigger}
            onSetTriggerPool={handleSetTriggerPool}
          />
        );
      if (automatedWorkTab === "wakeups")
        return (
          <WakeUpsManageView
            wakeUps={wakeUps}
            conversations={allConversations}
            currentUserId={user.id}
            onDismissWakeUp={handleDismissWakeUp}
            onConversationClick={(conversation) => {
              setP3View({
                kind: "conversation",
                conversationId: conversation.id,
              });
              setP4View(null);
            }}
          />
        );
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
          readRowIds={readRowIds}
          onRowsRead={handleRowsRead}
          unreadRowIds={unreadRowIds}
          onRowsUnread={handleRowsUnread}
          onLeaveConversation={handleLeaveConversation}
          leftConversationIds={leftConversationIds}
          triggers={triggers}
          selectedConversationId={
            p3View?.kind === "conversation" ? p3View.conversationId : null
          }
        />
      );
    }
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
          onUpdateSpaceNotifications={updateSpaceNotificationPreference}
          spaceNotificationSettings={spaceNotificationPreferences}
          activeTab={
            podContext.variant === "personal" ? "conversations" : activePodTab
          }
          onTabChange={
            podContext.variant === "personal" ? undefined : setActivePodTab
          }
          dynamicFileTabIds={dynamicFileTabIds}
          onAddFileToTopbar={handlePodFileDrop}
          initialDataSources={podFilesFor(podContext.spaceId)}
          // Pod files open in a panel (frames take focus, others share).
          onFileOpen={(dataSource) => {
            setP3View(fileSidePanelView(dataSource));
            setP4View(null);
          }}
          onFileDragChange={handlePodFileDragChange}
          fileToRevealInKnowledge={fileToRevealInKnowledge}
          onFileToRevealInKnowledgeHandled={() =>
            setFileToRevealInKnowledge(null)
          }
          podVariant={podContext.variant}
          showComposer={false}
          onNewConversation={() => openNewConversation(podContext.space.name)}
          currentUserId={user.id}
          readRowIds={readRowIds}
          onRowsRead={handleRowsRead}
          unreadRowIds={unreadRowIds}
          onRowsUnread={handleRowsUnread}
          onLeaveConversation={handleLeaveConversation}
          leftConversationIds={leftConversationIds}
          podTabCustomization={
            podContext.variant === "shared"
              ? {
                  tabs: podTabCustomizationTabs,
                  addableFiles: addablePodFiles,
                  onReorder: handlePodFileReorder,
                  onChangeIcon: handlePodTabIconChange,
                  onRename: handlePodTabRename,
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
        attachments={
          p2View.kind === "welcome" && p2View.attachment
            ? [p2View.attachment]
            : undefined
        }
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
      filesByConversationId: conversationFilesByConversationId,
    });

  const p3Label =
    p3View === null
      ? "Panel 3"
      : p3View.kind === "conversation"
        ? (p3Conversation?.title ?? "Conversation")
        : p3View.kind === "request"
          ? (p3Request?.title ?? "Request")
          : p3View.kind === "newConversation"
            ? "New conversation"
            : sidePanelLabel(p3View);

  const p3SizingType: PanelSizingType =
    p3View === null
      ? "secondary"
      : p3View.kind === "conversation" ||
          p3View.kind === "request" ||
          p3View.kind === "newConversation"
        ? "default"
        : sidePanelSizing(p3View);

  const p3Content = (() => {
    if (!p3View) return null;
    if (p3View.kind === "newConversation")
      return <NewConversation greeting={greeting} podName={p3View.podName} />;
    if (p3View.kind === "request") {
      if (!p3Request) return null;
      return (
        <RequestDetailView
          request={p3Request}
          currentUserId={user?.id}
          onResolve={handleResolveRequest}
        />
      );
    }
    if (p3View.kind === "conversation") {
      if (!p3Conversation) return null;
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
    }
    return renderSidePanel(p3View, setP3View, selectedConversation);
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
                <DropdownMenuRadioGroup
                  value={
                    spaceNotificationPreferences.get(podContext.spaceId) ??
                    DEFAULT_POD_NOTIFICATION_CONDITION
                  }
                  onValueChange={(v) =>
                    updateSpaceNotificationPreference(
                      podContext.spaceId,
                      v as PodNotificationCondition
                    )
                  }
                >
                  {POD_NOTIFICATION_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      label={option.label}
                    />
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  })();

  const p2TopBarLeft = (() => {
    if (p2View.kind === "build") {
      const section = BUILD_SECTION_DISPLAY[p2View.section];
      return (
        <Breadcrumbs
          items={[{ label: section.label, icon: section.icon }]}
          size="sm"
          hasLighterFont
        />
      );
    }
    if (p2View.kind === "conversation" && selectedConversation)
      return (
        <Breadcrumbs
          items={[{ label: selectedConversation.title }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "inboxAlt")
      return (
        <Breadcrumbs
          items={[{ label: "Inbox", icon: Inbox01 }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "files")
      return (
        <>
          <Breadcrumbs
            items={[{ label: ROOT_FOLDER_LABEL, icon: ROOT_FOLDER_ICON }]}
            size="sm"
            hasLighterFont
            className="shrink-0"
          />
          <SearchInput
            name="files-search"
            value={filesSearchText}
            onChange={setFilesSearchText}
            placeholder="Search files..."
            className="ml-1 w-full min-w-0 max-w-80"
          />
        </>
      );
    if (p2View.kind === "file")
      return (
        <Breadcrumbs
          items={[
            {
              label: p2View.dataSource.fileName,
              icon: getDataSourceIcon(p2View.dataSource) ?? File02,
            },
          ]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "agent")
      return (
        <Breadcrumbs
          items={[{ label: p2Label, icon: Robot }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "requests")
      return (
        <Breadcrumbs
          items={[{ label: "Requests", icon: MessageQuestionCircle }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "conversations")
      return (
        <Breadcrumbs
          items={[{ label: "Free conversations", icon: MessageChatSquare }]}
          size="sm"
          hasLighterFont
        />
      );
    if (p2View.kind === "automations")
      return (
        <NavTabPill
          value={automatedWorkTab}
          onValueChange={(value) =>
            setAutomatedWorkTab(value as AutomatedWorkTab)
          }
        >
          <NavTabPillList>
            <NavTabPillTrigger
              value="conversations"
              icon={MessageLightning01}
              aria-label="Triggered Conversations"
            >
              Triggered Conversations
            </NavTabPillTrigger>
            <NavTabPillTrigger
              value="triggers"
              icon={Zap}
              aria-label="Manage Triggers"
            >
              Manage Triggers
            </NavTabPillTrigger>
            <NavTabPillTrigger
              value="wakeups"
              icon={Clock}
              aria-label="Planned Wake-ups"
            >
              Planned Wake-ups
            </NavTabPillTrigger>
          </NavTabPillList>
        </NavTabPill>
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
    if (p2View.kind === "conversation") return conversationActionsFor("p3");
    if (podContext) return podTopBarRight;
    return null;
  })();

  const p3TopBarLeft = p3View ? (
    <Breadcrumbs items={[{ label: p3Label }]} size="sm" hasLighterFont />
  ) : null;

  const p3TopBarRight =
    p3View?.kind === "conversation" ? conversationActionsFor("p4") : null;

  const p4TopBarLeft = p4View ? (
    <Breadcrumbs items={[{ label: p4Label }]} size="sm" hasLighterFont />
  ) : null;

  /** Opens a Build screen, from the nav or from landing on the Build tab. */
  const openBuildSection = (section: BuildSection) => {
    setBuildNavItem(section);
    setP2View({ kind: "build", section });
    setP3View(null);
    setP4View(null);
  };

  // ── Sidebar (Nav) top bar ─────────────────────────────────────────────────
  const navTopBar = (
    <NavTabPill
      value={activeTab}
      onValueChange={(v) => {
        const tab = v as "chat" | "build" | "admin";
        setActiveTab(tab);
        // Build opens on its first section rather than keeping whatever the
        // Work tab had in the panel.
        if (tab === "build") {
          openBuildSection(BUILD_SECTIONS[0]);
        }
      }}
    >
      <NavTabPillList>
        <NavTabPillTrigger value="chat" icon={IntersectDust}>
          Work
        </NavTabPillTrigger>
        <NavTabPillTrigger value="build" icon={LayersThree01}>
          Build
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
            <NavigationList className="mx-sidebar-side-spacing pt-1">
              <SidebarSearch onClick={() => setIsPaletteOpen(true)} />
              <NavigationListItem
                label="Inbox"
                icon={Inbox01}
                selected={p2View.kind === "inboxAlt"}
                count={unreadCount > 0 ? unreadCount : undefined}
                onClick={() => {
                  setP2View({ kind: "inboxAlt" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
              <NavigationListItem
                label={ROOT_FOLDER_LABEL}
                icon={ROOT_FOLDER_ICON}
                selected={p2View.kind === "files"}
                onClick={() => {
                  setP2View({ kind: "files" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
              {/* Two controls on one line: the row goes to the list, the
                  button starts a conversation. Nesting the button inside the
                  row cost the label 7px it could not spare. */}
              <div className="flex items-center gap-1">
                <NavigationListItem
                  // The item reserves 32px of its label for a hover action,
                  // and the rule is gated on having no `suffix` rather than on
                  // having an action — so moving the button out does not
                  // release it, and the label would truncate on hover and stay
                  // truncated once selected.
                  className="min-w-0 flex-1 [&>div>span]:pr-0!"
                  label="Free conversations"
                  icon={MessageChatSquare}
                  selected={p2View.kind === "conversations"}
                  onClick={() => {
                    setP2View({ kind: "conversations" });
                    setP3View(null);
                    setP4View(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost-secondary"
                  icon={MessagePlusCircle}
                  tooltip="New conversation"
                  tooltipShortcut="C"
                  // Its own dark hover is white/0.08 against the nav rows'
                  // white/0.04, which reads as a different control.
                  className="size-9 shrink-0 rounded-lg dark:hover:bg-hover"
                  onClick={startNewConversation}
                />
              </div>
              <NavigationListItem
                label="Automated work"
                icon={Zap}
                selected={p2View.kind === "automations"}
                onClick={() => {
                  setP2View({ kind: "automations" });
                  setP3View(null);
                  setP4View(null);
                }}
              />
            </NavigationList>

            {/* Pods, files, folders and agents in one list: what the sidebar
                keeps, in the order it was put there. A drop names a position
                rather than a section. */}
            <NavigationList className="mx-sidebar-side-spacing mt-2 flex-shrink-0">
              <NavigationListCollapsibleSection
                label="Pinned"
                type="collapse"
                defaultOpen={true}
                className="rounded-xl"
                onDragOver={handleKeptDragOver}
                onDragLeave={handleKeptDragLeave}
                onDrop={handleKeptDrop}
                action={
                  <>
                    {keptItems.length > 0 && (
                      <Button
                        size="xs"
                        icon={Plus}
                        label="New"
                        variant="ghost-secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCreatePodIn(null);
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
                              const isFavorite = isEntryKept({
                                kind: "pod",
                                spaceId: space.id,
                              });
                              return (
                                <div
                                  key={space.id}
                                  className="group/browse flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-muted-background"
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
                                  <Button
                                    size="xs"
                                    variant={isFavorite ? "primary" : "ghost"}
                                    icon={Star01}
                                    tooltip={
                                      isFavorite
                                        ? "Remove from sidebar"
                                        : "Keep in the sidebar"
                                    }
                                    className={
                                      isFavorite
                                        ? undefined
                                        : "opacity-0 group-hover/browse:opacity-100"
                                    }
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleEntry({
                                        kind: "pod",
                                        spaceId: space.id,
                                      });
                                    }}
                                  />
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
                {keptItems.length > 0 ? (
                  keptItems.map((kept, index) => (
                    <div key={kept.key} data-kept-entry className="relative">
                      {dropIndex === index && <DropIndicator edge="top" />}
                      {renderKeptItem(kept)}
                      {dropIndex === keptItems.length &&
                        index === keptItems.length - 1 && (
                          <DropIndicator edge="bottom" />
                        )}
                    </div>
                  ))
                ) : (
                  <div className="relative">
                    {dropIndex !== null && <DropIndicator edge="top" />}
                    <NavigationListItem
                      label="Add Pods and files"
                      icon={Plus}
                      onClick={() => handleCreatePodIn(null)}
                    />
                  </div>
                )}
                {openUnkeptSpace && renderPodNavItem(openUnkeptSpace)}
              </NavigationListCollapsibleSection>
            </NavigationList>
          </ScrollArea>
        </div>
      )}

      {activeTab === "build" && (
        <BuildNav
          selectedItem={buildNavItem}
          onSelectItem={(item) => {
            if (isBuildSection(item)) {
              openBuildSection(item);
            } else {
              setBuildNavItem(item);
            }
          }}
          onNewAgentFromTemplate={() => {
            setP2View({ kind: "templates" });
            setP3View(null);
          }}
          companySpaces={model.companySpaces}
        />
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
              {/* The count rides the avatar too: inside a closed menu it is a
                  count nobody sees. */}
              <AvatarCounter
                name={user.fullName}
                visual={user.portrait}
                size="sm"
                isRounded
                count={pendingRequestCount}
                variant="highlight"
                badgeLabel={`${pendingRequestCount} pending requests`}
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
            label="Requests"
            icon={MessageQuestionCircle}
            endComponent={
              pendingRequestCount > 0 ? (
                <Counter
                  value={pendingRequestCount}
                  size="xs"
                  variant="highlight"
                />
              ) : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setP2View({ kind: "requests" });
              setStickyRequestIds(new Set());
              setP3View(null);
              setP4View(null);
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
          {/* Swaps the whole simulated workspace, to show the product on its
              first day, to someone who just joined a busy one, or to someone
              who has been in it a while. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger icon={Beaker02} label="Dev" />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuLabel label="Simulated workspace" />
                <DropdownMenuRadioGroup
                  value={model.profile}
                  onValueChange={(value) =>
                    onProfileChange(value as WorkspaceProfile)
                  }
                >
                  <DropdownMenuRadioItem
                    value="newWorkspace"
                    label="New Workspace"
                  />
                  <DropdownMenuRadioItem value="newMember" label="New Member" />
                  <DropdownMenuRadioItem
                    value="busyMember"
                    label="Busy Member"
                  />
                </DropdownMenuRadioGroup>
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

        {/* P3 — Level 2: conversation from space (takes focus), or a side
            panel from the P2 conversation (citation/files/credits — secondary,
            leaves focus where it is) */}
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

        {/* P4 — Level 3: citation / files / credits */}
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
        onClose={() => {
          setIsCreateRoomDialogOpen(false);
          setCreatePodParentId(null);
        }}
        destinations={podDestinations}
        defaultDestinationId={createPodParentId ?? defaultPodDestinationId}
        onNext={handleRoomNameNext}
      />
      <ToolDetailsSheet
        toolId={detailedToolId}
        onClose={() => setDetailedToolId(null)}
      />
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        items={paletteItems}
        actions={[
          {
            id: "action-new-conversation",
            group: "Actions",
            label: "New conversation",
            icon: MessagePlusCircle,
            onSelect: startNewConversation,
          },
          {
            id: "action-new-pod",
            group: "Actions",
            label: "New Pod",
            icon: Cube01,
            onSelect: () => handleCreatePodIn(null),
          },
        ]}
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

// ── Profile shell ─────────────────────────────────────────────────────────────

const PROFILE_STORAGE_KEY = "dust-file-system-workspace-profile";

const WORKSPACE_PROFILES: WorkspaceProfile[] = [
  "newWorkspace",
  "newMember",
  "busyMember",
];

function readStoredProfile(): WorkspaceProfile {
  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  return (
    WORKSPACE_PROFILES.find((profile) => profile === stored) ?? "busyMember"
  );
}

function DustFileSystem() {
  const [profile, setProfile] = useState<WorkspaceProfile>(readStoredProfile);
  const [user] = useState<User>(() => getRandomUsers(1)[0]);
  const model = useMemo(
    () => buildWorkspace(profile, user.id),
    [profile, user]
  );

  const changeProfile = (next: WorkspaceProfile) => {
    localStorage.setItem(PROFILE_STORAGE_KEY, next);
    setProfile(next);
  };

  // Keyed on the profile: a different workspace is a different session, so the
  // navigation, read rows and open panels all start over.
  return (
    <WorkspaceView
      key={profile}
      model={model}
      user={user}
      onProfileChange={changeProfile}
    />
  );
}

export default DustFileSystem;
