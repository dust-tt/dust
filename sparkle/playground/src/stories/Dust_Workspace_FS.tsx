import {
  ArrowLeft,
  Avatar,
  Breadcrumbs,
  Button,
  Building01,
  Chip,
  ContentMessage,
  Cube01,
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
  Folder,
  FolderPlus,
  Icon,
  IntersectDust,
  LayersThree01,
  Link01,
  Lock01,
  MessageCircle01,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Plus,
  ScrollArea,
  ScrollBar,
  SearchInput,
  Settings01,
  Tree,
  UserSquare,
  XClose,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { type ComponentType, useMemo, useRef, useState } from "react";

import { ConversationListItem } from "../components/ConversationListItem";
import { ConversationView } from "../components/ConversationView";
import { InputBar } from "../components/InputBar";
import { TreeDnd } from "../components/TreeDnd";
import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
} from "../components/PanelLayout";
import { getAgentById, mockAgents } from "../data/agents";
import type { Conversation } from "../data/types";
import { getIconForFileType } from "../data/dataSources";
import {
  buildWorkspaceFs,
  countFiles,
  CURRENT_USER,
  CURRENT_USER_ID,
  MY_FILES_ID,
  type FsIndex,
  type FsNode,
  type FsSpaceAccess,
  getEnclosingPodId,
  getFsUserById,
  getPath,
  getSpaceId,
  indexFs,
  isInside,
  type ConversationDraft,
  type Pod,
  type PodConversation,
} from "../data/workspaceFs";

type IconType = ComponentType<{ className?: string }>;

// What the main column shows: the selected folder, or a document opened on
// top of it (a file from the tree, or a draft that lives in a conversation).
// What is being dragged: a tree node, a conversation, or an unsaved draft.
type DragItem =
  | { kind: "node"; id: string }
  | { kind: "conversation"; id: string }
  | { kind: "draft"; id: string };

interface PendingMove {
  item: DragItem;
  targetId: string;
  name: string;
  fromSpaceId: string;
  toSpaceId: string;
}

/** Drag-and-drop wiring for one row, computed by the story. */
interface RowDnd {
  props: React.HTMLAttributes<HTMLDivElement>;
  isDropTarget: boolean;
  isDragging: boolean;
}

type MainView =
  | { kind: "folder" }
  | { kind: "file"; nodeId: string; query: string | null }
  | { kind: "draft"; draftId: string };

function formatAgo(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  return `${Math.round(hours / 24)} d ago`;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function DustWorkspaceFs() {
  const [initial] = useState(buildWorkspaceFs);
  const { spaceAccess } = initial;
  const [nodes, setNodes] = useState<FsNode[]>(initial.nodes);
  const [drafts, setDrafts] = useState<ConversationDraft[]>(initial.drafts);
  const [mainView, setMainView] = useState<MainView>({ kind: "folder" });
  const [pods, setPods] = useState<Pod[]>(initial.pods);
  const [conversations, setConversations] = useState<PodConversation[]>(
    initial.conversations
  );

  const index = useMemo(() => indexFs(nodes), [nodes]);
  const podById = useMemo(
    () => new Map(pods.map((p) => [p.folderId, p])),
    [pods]
  );
  const podIds = useMemo(() => new Set(podById.keys()), [podById]);

  const [selectedId, setSelectedId] = useState<string>(
    pods[0]?.folderId ?? nodes[0].id
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(getPath(index, selectedId).map((n) => n.id))
  );
  const [isRailOpen, setIsRailOpen] = useState(true);
  // Null until dragged; the CSS clamp sizes it before that.
  const [railWidth, setRailWidth] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const startRailResize = (e: React.PointerEvent) => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const rect = row.getBoundingClientRect();
      setRailWidth(
        Math.max(384, Math.min(rect.width * 0.6, rect.right - ev.clientX))
      );
    };
    const up = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [openConversationId, setOpenConversationId] = useState<string | null>(
    null
  );
  const [searchText, setSearchText] = useState("");
  // A folder where "Start working here" was clicked; it becomes a pod only
  // once the first message is sent.
  const [startFolderId, setStartFolderId] = useState<string | null>(null);
  const [attachPodId, setAttachPodId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const openConversationData = conversations.find(
    (c) => c.id === openConversationId
  );
  const selected = index.byId.get(selectedId);
  const selectedPod = podById.get(selectedId) ?? null;
  const enclosingPodId = useMemo(
    () => getEnclosingPodId(index, podIds, selectedId),
    [index, podIds, selectedId]
  );

  // Unread counts per pod, then rolled up to every ancestor for triage.
  const unreadByNodeId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conv of conversations) {
      if (!conv.isUnread) {
        continue;
      }
      for (const node of getPath(index, conv.podFolderId)) {
        counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [conversations, index]);

  // Nodes attached to the pod in focus, marked in the tree.
  const attachedIdsInFocus = useMemo(() => {
    const pod = enclosingPodId ? podById.get(enclosingPodId) : undefined;
    return new Set(pod?.attachments.map((a) => a.nodeId) ?? []);
  }, [enclosingPodId, podById]);

  const draftsByConversationId = useMemo(() => {
    const byId = new Map<string, ConversationDraft[]>();
    for (const draft of drafts) {
      const list = byId.get(draft.conversationId) ?? [];
      list.push(draft);
      byId.set(draft.conversationId, list);
    }
    return byId;
  }, [drafts]);

  const railConversations = useMemo(
    () => conversations.filter((c) => c.podFolderId === enclosingPodId),
    [conversations, enclosingPodId]
  );

  const citedIds = useMemo(
    () => new Set(openConversationData?.citedNodeIds ?? []),
    [openConversationData]
  );

  const myFilesNode = index.byId.get(MY_FILES_ID);
  const workspaceRoots = useMemo(
    () =>
      (index.childrenById.get(null) ?? []).filter((n) => n.id !== MY_FILES_ID),
    [index]
  );

  const searchMatches = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return null;
    }
    return nodes.filter((n) => n.name.toLowerCase().includes(query));
  }, [nodes, searchText]);

  const navigate = (nodeId: string) => {
    const target = index.byId.get(nodeId);
    if (!target) {
      return;
    }
    // Files open in their parent folder.
    const folderId =
      target.kind === "file" && target.parentId ? target.parentId : nodeId;
    setSelectedId(folderId);
    setMainView({ kind: "folder" });
    setStartFolderId(null);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const n of getPath(index, folderId)) {
        next.add(n.id);
      }
      return next;
    });
    // Keep the open conversation while browsing its own pod.
    const nextPodId = getEnclosingPodId(index, podIds, folderId);
    if (nextPodId !== openConversationData?.podFolderId) {
      setOpenConversationId(null);
    }
    if (podIds.has(folderId)) {
      setIsRailOpen(true);
    }
  };

  // Files open in the main column on top of the current folder; folders
  // navigate.
  const openNode = (nodeId: string, query: string | null = null) => {
    const node = index.byId.get(nodeId);
    if (node?.kind === "file") {
      setMainView({ kind: "file", nodeId, query });
    } else {
      navigate(nodeId);
    }
  };

  // ConversationView reports opened chips and citations by title: a draft
  // of this conversation first, then any document in the tree.
  const openByTitle = (conversation: PodConversation, title: string) => {
    const draft = (draftsByConversationId.get(conversation.id) ?? []).find(
      (d) => d.name === title
    );
    if (draft) {
      openDraft(draft);
      return;
    }
    const node = nodes.find((n) => n.name === title);
    if (node) {
      openNode(node.id, conversation.searchQuery);
    }
  };

  const openDraft = (draft: ConversationDraft) => {
    if (draft.savedNodeId) {
      openNode(draft.savedNodeId);
    } else {
      setMainView({ kind: "draft", draftId: draft.id });
    }
    setIsRailOpen(true);
    setOpenConversationId(draft.conversationId);
  };

  // Saving moves the draft itself into the folder: it becomes a file there
  // and the conversation keeps pointing at it.
  const saveDraft = (draftId: string, folderId: string) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft || draft.savedNodeId) {
      return;
    }
    const nodeId = `file-${draft.id}`;
    setNodes((prev) => [
      ...prev,
      {
        id: nodeId,
        parentId: folderId,
        kind: "file",
        name: draft.name,
        fileType: draft.fileType,
        updatedAt: new Date(),
        updatedById: CURRENT_USER_ID,
      },
    ]);
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, savedNodeId: nodeId } : d))
    );
    if (mainView.kind === "draft" && mainView.draftId === draftId) {
      setMainView({ kind: "file", nodeId, query: null });
    }
  };

  // ── Moves ──────────────────────────────────────────────────────────────────
  // Where the dragged item lives today, for no-op checks and access changes.
  const dragSource = (
    item: DragItem
  ): { name: string; folderId: string } | null => {
    if (item.kind === "node") {
      const node = index.byId.get(item.id);
      return node?.parentId
        ? { name: node.name, folderId: node.parentId }
        : null;
    }
    if (item.kind === "conversation") {
      const conv = conversations.find((c) => c.id === item.id);
      return conv ? { name: conv.title, folderId: conv.podFolderId } : null;
    }
    const draft = drafts.find((d) => d.id === item.id);
    const conv = conversations.find((c) => c.id === draft?.conversationId);
    return draft && conv
      ? { name: draft.name, folderId: conv.podFolderId }
      : null;
  };

  const canDrop = (item: DragItem, targetId: string): boolean => {
    const target = index.byId.get(targetId);
    const source = dragSource(item);
    if (!target || target.kind === "file" || !source) {
      return false;
    }
    const targetPodId = getEnclosingPodId(index, podIds, targetId);
    if (item.kind === "conversation") {
      // Conversations live in pods: drop anywhere in another pod.
      return targetPodId !== null && targetPodId !== source.folderId;
    }
    if (item.kind === "draft") {
      return true;
    }
    if (targetId === source.folderId || isInside(index, targetId, item.id)) {
      return false;
    }
    // No pod in a pod.
    const carriesPod = [...podIds].some((id) => isInside(index, id, item.id));
    return !(carriesPod && targetPodId !== null);
  };

  const applyMove = (item: DragItem, targetId: string) => {
    if (item.kind === "node") {
      setNodes((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, parentId: targetId } : n))
      );
    } else if (item.kind === "conversation") {
      const podId = getEnclosingPodId(index, podIds, targetId);
      if (!podId) {
        return;
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, podFolderId: podId } : c))
      );
      navigate(podId);
      setOpenConversationId(item.id);
    } else {
      saveDraft(item.id, targetId);
    }
  };

  // Moving to another space changes who can see the item: confirm first.
  const requestMove = (item: DragItem, targetId: string) => {
    const source = dragSource(item);
    if (!source || !canDrop(item, targetId)) {
      return;
    }
    const fromSpaceId = getSpaceId(index, source.folderId);
    const toSpaceId = getSpaceId(index, targetId);
    if (fromSpaceId !== toSpaceId) {
      setPendingMove({
        item,
        targetId,
        name: source.name,
        fromSpaceId,
        toSpaceId,
      });
    } else {
      applyMove(item, targetId);
    }
  };

  // Drag handlers shared by every drop target (tree rows, folder rows).
  const dropTargetProps = (targetId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragItem && canDrop(dragItem, targetId)) {
        e.preventDefault();
        e.stopPropagation();
        setDropTargetId(targetId);
      }
    },
    onDragLeave: () =>
      setDropTargetId((current) => (current === targetId ? null : current)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragItem) {
        requestMove(dragItem, targetId);
      }
      setDragItem(null);
      setDropTargetId(null);
    },
  });

  const dragSourceProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      // Firefox only starts a drag that carries data.
      e.dataTransfer.setData("text/plain", item.id);
      e.dataTransfer.effectAllowed = "move";
      setDragItem(item);
    },
    onDragEnd: () => {
      setDragItem(null);
      setDropTargetId(null);
    },
  });

  const rowDnd = (node: FsNode): RowDnd => ({
    props: {
      ...dragSourceProps({ kind: "node", id: node.id }),
      ...(node.kind === "file" ? {} : dropTargetProps(node.id)),
    },
    isDropTarget: dropTargetId === node.id,
    isDragging: dragItem?.kind === "node" && dragItem.id === node.id,
  });

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // No pod in a pod: a folder inside a pod, or holding one, stays a folder.
  const canBecomePod = (folderId: string): boolean => {
    const node = index.byId.get(folderId);
    return (
      node?.kind === "folder" &&
      getEnclosingPodId(index, podIds, folderId) === null &&
      ![...podIds].some((id) => isInside(index, id, folderId))
    );
  };

  // First message from a folder: it becomes a pod, or, when it can't, the
  // conversation starts in My files with the folder added to its context.
  const sendFirstMessage = (folderId: string) => {
    setStartFolderId(null);
    if (canBecomePod(folderId)) {
      setPods((prev) => [
        ...prev,
        { folderId, description: "", attachments: [], createdAt: new Date() },
      ]);
      startConversation(folderId);
      return;
    }
    setPods((prev) =>
      prev.map((p) =>
        p.folderId === MY_FILES_ID &&
        !p.attachments.some((a) => a.nodeId === folderId)
          ? {
              ...p,
              attachments: [
                ...p.attachments,
                {
                  nodeId: folderId,
                  addedById: CURRENT_USER_ID,
                  addedAt: new Date(),
                },
              ],
            }
          : p
      )
    );
    navigate(MY_FILES_ID);
    startConversation(MY_FILES_ID);
  };

  const setAttachments = (podId: string, nodeIds: string[]) => {
    setPods((prev) =>
      prev.map((p) => {
        if (p.folderId !== podId) {
          return p;
        }
        const kept = p.attachments.filter((a) => nodeIds.includes(a.nodeId));
        const added = nodeIds
          .filter((id) => !kept.some((a) => a.nodeId === id))
          .map((nodeId) => ({
            nodeId,
            addedById: CURRENT_USER_ID,
            addedAt: new Date(),
          }));
        return { ...p, attachments: [...kept, ...added] };
      })
    );
  };

  const startConversation = (podId: string) => {
    const conv: PodConversation = {
      id: `conv-new-${Date.now()}`,
      podFolderId: podId,
      title: "New conversation",
      agentId: "agent-1",
      authorId: CURRENT_USER_ID,
      updatedAt: new Date(),
      isUnread: false,
      citedNodeIds: [],
      searchQuery: "",
    };
    setConversations((prev) => [conv, ...prev]);
    setIsRailOpen(true);
    setOpenConversationId(conv.id);
  };

  const openConversation = (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, isUnread: false } : c))
    );
    setOpenConversationId(convId);
  };

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const nodeVisual = (node: FsNode): IconType => {
    if (node.id === MY_FILES_ID) {
      return UserSquare;
    }
    if (node.kind === "space") {
      return spaceAccess[node.id]?.isRestricted ? Lock01 : Building01;
    }
    if (node.kind === "file") {
      return node.fileType ? getIconForFileType(node.fileType) : Folder;
    }
    return podIds.has(node.id) ? Cube01 : Folder;
  };

  const renderTreeNode = (node: FsNode): React.ReactNode => {
    const folders = (index.childrenById.get(node.id) ?? []).filter(
      (c) => c.kind !== "file"
    );
    const isExpanded = expandedIds.has(node.id);
    // Show own count when expanded, rolled-up count when collapsed.
    const ownUnread = conversations.filter(
      (c) => c.podFolderId === node.id && c.isUnread
    ).length;
    const unread = isExpanded ? ownUnread : (unreadByNodeId.get(node.id) ?? 0);
    const isAttached = attachedIdsInFocus.has(node.id);

    return (
      <TreeDnd.Item
        key={node.id}
        label={node.name}
        visual={nodeVisual(node)}
        {...(node.kind === "space"
          ? {}
          : dragSourceProps({ kind: "node", id: node.id }))}
        {...dropTargetProps(node.id)}
        isDropHighlight={dropTargetId === node.id}
        isDragging={dragItem?.kind === "node" && dragItem.id === node.id}
        type={folders.length > 0 ? "node" : "leaf"}
        collapsed={!isExpanded}
        onChevronClick={() => toggleExpanded(node.id)}
        isSelected={node.id === selectedId}
        onItemClick={() => navigate(node.id)}
        labelClassName={podIds.has(node.id) ? "font-semibold" : undefined}
        areActionsFading={false}
        actions={
          <div className="flex items-center gap-1">
            {isAttached && (
              <Icon visual={Link01} size="xs" className="text-highlight-500" />
            )}
            {unread > 0 && (
              <Chip size="mini" color="highlight" label={`${unread}`} />
            )}
          </div>
        }
      >
        {folders.map(renderTreeNode)}
      </TreeDnd.Item>
    );
  };

  const navContent = (
    <div className="flex min-h-0 flex-1 flex-col bg-app-background">
      <div className="flex gap-2 p-sidebar-side-spacing">
        <div className="flex-1">
          <SearchInput
            name="search"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search files"
          />
        </div>
        <Button
          variant="highlight"
          size="sm"
          icon={Plus}
          label="New"
          tooltip={`New conversation in ${
            index.byId.get(enclosingPodId ?? MY_FILES_ID)?.name
          }`}
          onClick={() => {
            const podId = enclosingPodId ?? MY_FILES_ID;
            if (podId !== enclosingPodId) {
              navigate(podId);
            }
            startConversation(podId);
          }}
        />
      </div>
      <ScrollArea className="flex-1">
        <ScrollBar orientation="vertical" size="minimal" />
        <div className="px-sidebar-side-spacing pb-4">
          {searchMatches ? (
            <SearchResults
              matches={searchMatches}
              index={index}
              visualFor={nodeVisual}
              onSelect={(id) => {
                setSearchText("");
                navigate(id);
              }}
            />
          ) : (
            <>
              <TreeDnd variant="navigator">
                {myFilesNode && renderTreeNode(myFilesNode)}
              </TreeDnd>
              <div className="px-2 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
                Workspace
              </div>
              <TreeDnd variant="navigator">
                {workspaceRoots.map(renderTreeNode)}
              </TreeDnd>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const navTopBar = (
    <NavTabPill value="work">
      <NavTabPillList>
        <NavTabPillTrigger value="work" icon={IntersectDust}>
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

  // ── Main panel ─────────────────────────────────────────────────────────────
  // Inside a pod the conversations column is already there to start from.
  const canStartHere =
    selected !== undefined &&
    selected.kind !== "file" &&
    enclosingPodId === null &&
    startFolderId !== selected.id;
  const openedFile =
    mainView.kind === "file" ? index.byId.get(mainView.nodeId) : undefined;
  const openedDraft =
    mainView.kind === "draft"
      ? drafts.find((d) => d.id === mainView.draftId)
      : undefined;
  const openedDraftConversation = openedDraft
    ? conversations.find((c) => c.id === openedDraft.conversationId)
    : undefined;
  const openedName = openedFile?.name ?? openedDraft?.name ?? null;

  const breadcrumbs = openedFile ? (
    <Breadcrumbs
      size="sm"
      hasLighterFont
      items={getPath(index, openedFile.id).map((n) => ({
        label: n.name,
        icon: nodeVisual(n),
        onClick: () => openNode(n.id),
      }))}
    />
  ) : openedDraft && openedDraftConversation ? (
    <Breadcrumbs
      size="sm"
      hasLighterFont
      items={[
        ...getPath(index, openedDraftConversation.podFolderId).map((n) => ({
          label: n.name,
          icon: nodeVisual(n),
          onClick: () => navigate(n.id),
        })),
        {
          label: openedDraftConversation.title,
          icon: MessageCircle01,
          onClick: () => openConversation(openedDraftConversation.id),
        },
        { label: openedDraft.name },
      ]}
    />
  ) : selected ? (
    <Breadcrumbs
      size="sm"
      hasLighterFont
      items={getPath(index, selected.id).map((n) => ({
        label: n.name,
        icon: nodeVisual(n),
        onClick: () => navigate(n.id),
      }))}
    />
  ) : null;

  const documentContent = openedFile ? (
    <DocumentView
      name={openedFile.name}
      visual={nodeVisual(openedFile)}
      location={getPath(index, openedFile.id)
        .slice(0, -1)
        .map((n) => n.name)
        .join(" / ")}
      query={mainView.kind === "file" ? mainView.query : null}
      onClose={() => setMainView({ kind: "folder" })}
    />
  ) : openedDraft && openedDraftConversation ? (
    <DocumentView
      name={openedDraft.name}
      visual={getIconForFileType(openedDraft.fileType)}
      location={`Draft in “${openedDraftConversation.title}” · not in a folder yet`}
      query={null}
      actions={
        <SaveDraftMenu
          index={index}
          podFolderId={openedDraftConversation.podFolderId}
          onSave={(folderId) => saveDraft(openedDraft.id, folderId)}
        />
      }
      onClose={() => setMainView({ kind: "folder" })}
    />
  ) : null;

  const podDrafts = railPodDrafts(
    selectedPod?.folderId ?? null,
    conversations,
    draftsByConversationId
  );

  const mainContent =
    documentContent ??
    (selected && (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
        <NodeHeader
          node={selected}
          visual={nodeVisual(selected)}
          access={spaceAccess[getSpaceId(index, selected.id)]}
          pod={selectedPod}
          actions={
            selectedPod ? (
              !isRailOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={MessageCircle01}
                  label={`Conversations (${railConversations.length})`}
                  onClick={() => setIsRailOpen(true)}
                />
              )
            ) : canStartHere ? (
              <Button
                variant="highlight"
                size="sm"
                icon={MessageCircle01}
                label="Start working here"
                onClick={() => setStartFolderId(selected.id)}
              />
            ) : null
          }
        />

        {selectedPod ? (
          <PodContext
            pod={selectedPod}
            index={index}
            spaceAccess={spaceAccess}
            visualFor={nodeVisual}
            citedIds={citedIds}
            dndFor={rowDnd}
            onNavigate={openNode}
            onAttach={() => setAttachPodId(selectedPod.folderId)}
            onDetach={(nodeId) =>
              setAttachments(
                selectedPod.folderId,
                selectedPod.attachments
                  .map((a) => a.nodeId)
                  .filter((id) => id !== nodeId)
              )
            }
          />
        ) : (
          <NodeList
            nodes={index.childrenById.get(selected.id) ?? []}
            index={index}
            visualFor={nodeVisual}
            citedIds={citedIds}
            dndFor={rowDnd}
            onOpen={openNode}
            emptyLabel="This folder is empty."
          />
        )}

        {selectedPod && podDrafts.length > 0 && (
          <DraftsSection
            drafts={podDrafts}
            conversations={conversations}
            index={index}
            dragPropsFor={(id) => dragSourceProps({ kind: "draft", id })}
            onOpen={openDraft}
            onSave={saveDraft}
          />
        )}
      </div>
    ));

  const railPod = enclosingPodId ? podById.get(enclosingPodId) : undefined;
  const railPodName = railPod ? index.byId.get(railPod.folderId)?.name : "";

  const startFolder = startFolderId ? index.byId.get(startFolderId) : undefined;
  const isRailShown =
    startFolder !== undefined || (railPod !== undefined && isRailOpen);

  const railTopBarLeft = startFolder ? (
    <Breadcrumbs
      size="sm"
      hasLighterFont
      items={[{ label: `New conversation in ${startFolder.name}` }]}
    />
  ) : openConversationData ? (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        size="xmini"
        variant="ghost-secondary"
        icon={ArrowLeft}
        tooltip="All conversations"
        onClick={() => setOpenConversationId(null)}
      />
      <Breadcrumbs
        size="sm"
        hasLighterFont
        items={[{ label: openConversationData.title }]}
      />
    </div>
  ) : (
    <Breadcrumbs
      size="sm"
      hasLighterFont
      items={[{ label: `Conversations in ${railPodName}` }]}
    />
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

        <PanelLayoutPanel
          label={selected?.name ?? "Files"}
          isOpen={true}
          onClose={() => {}}
          topBarLeft={breadcrumbs}
        >
          {/* The conversations column lives inside the card so the tree
              sidebar stays visible next to it. */}
          <div ref={rowRef} className="flex h-full min-h-0 w-full">
            <div className="h-full min-w-0 flex-1 overflow-y-auto">
              {mainContent}
            </div>
            {isRailShown && (
              <>
                <div
                  className="group relative flex w-px flex-none cursor-col-resize items-stretch"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize conversations"
                  onPointerDown={startRailResize}
                >
                  <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
                  <div className="relative w-px bg-separator transition-all duration-[120ms] group-hover:w-[2px] group-hover:[background:var(--panel-resize-focus-border)] group-active:w-[2px] group-active:[background:var(--panel-resize-focus-border)]" />
                </div>
                <aside
                  className={cn(
                    "flex shrink-0 flex-col",
                    railWidth === null && "w-[clamp(28rem,40%,48rem)]"
                  )}
                  style={railWidth === null ? undefined : { width: railWidth }}
                >
                  <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
                    {railTopBarLeft}
                    <Button
                      size="xmini"
                      variant="ghost-secondary"
                      icon={XClose}
                      tooltip="Hide conversations"
                      onClick={() => {
                        setIsRailOpen(false);
                        setOpenConversationId(null);
                        setStartFolderId(null);
                      }}
                    />
                  </div>
                  <div className="min-h-0 flex-1">
                    {startFolder ? (
                      <StartHere
                        folderName={startFolder.name}
                        becomesPod={canBecomePod(startFolder.id)}
                        visibility={visibilityLine(
                          spaceAccess[getSpaceId(index, startFolder.id)],
                          index.byId.get(getSpaceId(index, startFolder.id))
                            ?.name ?? ""
                        )}
                        onSend={() => sendFirstMessage(startFolder.id)}
                      />
                    ) : openConversationData ? (
                      <ConversationView
                        key={openConversationData.id}
                        conversation={toViewConversation(
                          openConversationData,
                          draftsByConversationId.get(openConversationData.id) ??
                            [],
                          index
                        )}
                        locutor={CURRENT_USER}
                        users={[CURRENT_USER]}
                        agents={mockAgents}
                        conversationsWithMessages={[]}
                        onCitationOpen={({ title }) =>
                          openByTitle(openConversationData, title)
                        }
                      />
                    ) : (
                      railPod && (
                        <ConversationRail
                          pod={railPod}
                          podName={railPodName ?? ""}
                          conversations={railConversations}
                          draftsByConversationId={draftsByConversationId}
                          openedName={openedName}
                          dragPropsFor={(id) =>
                            dragSourceProps({ kind: "conversation", id })
                          }
                          onStart={() => startConversation(railPod.folderId)}
                          onOpen={openConversation}
                        />
                      )
                    )}
                  </div>
                </aside>
              </>
            )}
          </div>
        </PanelLayoutPanel>
      </PanelLayout>

      {pendingMove && (
        <MoveDialog
          move={pendingMove}
          targetName={index.byId.get(pendingMove.targetId)?.name ?? ""}
          spaceAccess={spaceAccess}
          spaceName={(id) => index.byId.get(id)?.name ?? ""}
          onCancel={() => setPendingMove(null)}
          onConfirm={() => {
            applyMove(pendingMove.item, pendingMove.targetId);
            setPendingMove(null);
          }}
        />
      )}

      {attachPodId && podById.get(attachPodId) && (
        <AttachDialog
          pod={podById.get(attachPodId) as Pod}
          index={index}
          spaceAccess={spaceAccess}
          visualFor={nodeVisual}
          onClose={() => setAttachPodId(null)}
          onSave={(ids) => {
            setAttachments(attachPodId, ids);
            setAttachPodId(null);
          }}
        />
      )}
    </>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function accessLabel(access: FsSpaceAccess | undefined): string {
  if (!access) {
    return "";
  }
  const count = access.memberIds.length;
  if (count === 1 && access.memberIds[0] === CURRENT_USER_ID) {
    return "Only you";
  }
  return access.isRestricted
    ? `Restricted · ${count} ${count === 1 ? "person" : "people"}`
    : "Everyone in the workspace";
}

/** Who sees conversations started in a space, as one sentence. */
function visibilityLine(
  access: FsSpaceAccess | undefined,
  spaceName: string
): string {
  if (!access) {
    return "";
  }
  if (
    access.memberIds.length === 1 &&
    access.memberIds[0] === CURRENT_USER_ID
  ) {
    return "Only you can see them.";
  }
  return access.isRestricted
    ? `Only the ${access.memberIds.length} people in ${spaceName} can see them.`
    : "Everyone in the workspace can see them.";
}

function StartHere({
  folderName,
  becomesPod,
  visibility,
  onSend,
}: {
  folderName: string;
  becomesPod: boolean;
  visibility: string;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      <InputBar
        isFloating={false}
        autoFocus
        placeholder={`Ask in ${folderName}`}
        onSend={onSend}
      />
      <p className="px-1 text-xs text-muted-foreground">
        {becomesPod
          ? `Conversations here read ${folderName} and everything in it. ${visibility}`
          : `This starts in My files, with ${folderName} added to its context. Only you can see it.`}
      </p>
    </div>
  );
}

function NodeHeader({
  node,
  visual,
  access,
  pod,
  actions,
}: {
  node: FsNode;
  visual: IconType;
  access: FsSpaceAccess | undefined;
  pod: Pod | null;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon visual={visual} size="md" className="text-foreground" />
          <h1 className="heading-2xl truncate text-foreground">{node.name}</h1>
          {pod && (
            <Chip
              size="xs"
              color="highlight"
              label={node.id === MY_FILES_ID ? "Default pod" : "Pod"}
            />
          )}
        </div>
        {pod?.description && (
          <p className="text-sm text-muted-foreground">{pod.description}</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon visual={access?.isRestricted ? Lock01 : Building01} size="xs" />
          <span>
            {accessLabel(access)}
            {pod && node.kind !== "space" && " · same access as the folder"}
          </span>
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

function NodeRow({
  node,
  index,
  visual,
  onOpen,
  meta,
  badges,
  action,
  isCited = false,
  dnd,
}: {
  node: FsNode;
  index: FsIndex;
  visual: IconType;
  onOpen: () => void;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  action?: React.ReactNode;
  isCited?: boolean;
  dnd?: RowDnd;
}) {
  const author = getFsUserById(node.updatedById);
  return (
    <div
      {...dnd?.props}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
        dnd?.isDropTarget
          ? "bg-highlight-50 ring-1 ring-inset ring-highlight-300"
          : isCited
            ? "bg-highlight-50"
            : "hover:bg-hover",
        dnd?.isDragging && "opacity-50"
      )}
      onClick={onOpen}
    >
      <Icon visual={visual} size="sm" className="text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Badges sit with the name so they never push the columns. */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {node.name}
          </span>
          {isCited && <Chip size="mini" color="highlight" label="Cited" />}
          {badges}
        </div>
        {meta && (
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        )}
      </div>
      {/* Fixed-width columns keep counts and updates aligned across sections,
          whether or not a row has an action. */}
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
        {node.kind !== "file" && pluralize(countFiles(index, node.id), "file")}
      </span>
      <span className="flex w-28 shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {author && (
          <Avatar size="xs" name={author.fullName} visual={author.portrait} />
        )}
        {formatAgo(node.updatedAt)}
      </span>
      <span className="flex w-6 shrink-0 justify-center">{action}</span>
    </div>
  );
}

function NodeList({
  nodes,
  index,
  visualFor,
  citedIds,
  dndFor,
  onOpen,
  emptyLabel,
}: {
  nodes: FsNode[];
  index: FsIndex;
  visualFor: (n: FsNode) => IconType;
  citedIds: Set<string>;
  dndFor?: (n: FsNode) => RowDnd;
  onOpen: (id: string) => void;
  emptyLabel: string;
}) {
  if (nodes.length === 0) {
    return <p className="px-3 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-col">
      {nodes.map((n) => (
        <NodeRow
          key={n.id}
          node={n}
          index={index}
          visual={visualFor(n)}
          onOpen={() => onOpen(n.id)}
          isCited={containsCited(index, citedIds, n.id)}
          dnd={dndFor?.(n)}
        />
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 px-3">
      <div className="flex flex-col">
        <h2 className="heading-lg text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Whether a cited document is this node or sits inside it. */
function containsCited(
  index: FsIndex,
  citedIds: Set<string>,
  nodeId: string
): boolean {
  return [...citedIds].some((id) => isInside(index, id, nodeId));
}

/** Pod readers who can't read the attached node. */
function hiddenFromCount(
  index: FsIndex,
  spaceAccess: Record<string, FsSpaceAccess>,
  podId: string,
  nodeId: string
): { hidden: number; total: number } {
  const podReaders = spaceAccess[getSpaceId(index, podId)]?.memberIds ?? [];
  const nodeReaders = new Set(
    spaceAccess[getSpaceId(index, nodeId)]?.memberIds ?? []
  );
  return {
    hidden: podReaders.filter((id) => !nodeReaders.has(id)).length,
    total: podReaders.length,
  };
}

function PodContext({
  pod,
  index,
  spaceAccess,
  visualFor,
  citedIds,
  dndFor,
  onNavigate,
  onAttach,
  onDetach,
}: {
  pod: Pod;
  index: FsIndex;
  spaceAccess: Record<string, FsSpaceAccess>;
  visualFor: (n: FsNode) => IconType;
  citedIds: Set<string>;
  dndFor: (n: FsNode) => RowDnd;
  onNavigate: (id: string) => void;
  onAttach: () => void;
  onDetach: (nodeId: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <SectionHeader title="In this folder" />
        <NodeList
          nodes={index.childrenById.get(pod.folderId) ?? []}
          index={index}
          visualFor={visualFor}
          citedIds={citedIds}
          dndFor={dndFor}
          onOpen={onNavigate}
          emptyLabel="Nothing here yet. Drop files in this folder to give the pod context."
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionHeader
          title="From other folders"
          action={
            <Button
              size="xs"
              variant="outline"
              icon={Plus}
              label="Add"
              onClick={onAttach}
            />
          }
        />
        {pod.attachments.length === 0 ? (
          <p className="px-3 text-sm text-muted-foreground">
            Nothing added from other folders yet. Add files or folders from
            anywhere in your workspace. They stay in sync with the original and
            keep its access rules.
          </p>
        ) : (
          <div className="flex flex-col">
            {pod.attachments.map((a) => {
              const node = index.byId.get(a.nodeId);
              if (!node) {
                return null;
              }
              const { hidden, total } = hiddenFromCount(
                index,
                spaceAccess,
                pod.folderId,
                node.id
              );
              const location = getPath(index, node.id)
                .slice(0, -1)
                .map((n) => n.name)
                .join(" / ");
              return (
                <NodeRow
                  key={a.nodeId}
                  node={node}
                  index={index}
                  visual={visualFor(node)}
                  onOpen={() => onNavigate(node.id)}
                  isCited={containsCited(index, citedIds, node.id)}
                  meta={`From ${location} · Added by ${
                    getFsUserById(a.addedById)?.firstName ?? "someone"
                  }`}
                  badges={
                    hidden > 0 && (
                      <Chip
                        size="mini"
                        color="info"
                        icon={Lock01}
                        label={`${total - hidden}/${total} can see`}
                      />
                    )
                  }
                  action={
                    <Button
                      size="xmini"
                      variant="ghost-secondary"
                      icon={XClose}
                      tooltip="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDetach(node.id);
                      }}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/** Unsaved drafts across the conversations of a pod, newest first. */
function railPodDrafts(
  podFolderId: string | null,
  conversations: PodConversation[],
  draftsByConversationId: Map<string, ConversationDraft[]>
): ConversationDraft[] {
  if (!podFolderId) {
    return [];
  }
  return conversations
    .filter((c) => c.podFolderId === podFolderId)
    .flatMap((c) => draftsByConversationId.get(c.id) ?? [])
    .filter((d) => d.savedNodeId === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Folders a draft can be saved to: the pod folder and its subfolders. */
function saveTargets(index: FsIndex, podFolderId: string): FsNode[] {
  const collect = (id: string): FsNode[] => {
    const node = index.byId.get(id);
    if (!node) {
      return [];
    }
    return [
      node,
      ...(index.childrenById.get(id) ?? [])
        .filter((c) => c.kind === "folder")
        .flatMap((c) => collect(c.id)),
    ];
  };
  return collect(podFolderId);
}

function SaveDraftMenu({
  index,
  podFolderId,
  onSave,
  size = "sm",
}: {
  index: FsIndex;
  podFolderId: string;
  onSave: (folderId: string) => void;
  size?: "xs" | "sm";
}) {
  const podName = index.byId.get(podFolderId)?.name;
  const targets = saveTargets(index, podFolderId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant="outline"
          icon={FolderPlus}
          label={`Save to ${podName}`}
          isSelect
          onClick={(e) => e.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {targets.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            icon={folder.id === podFolderId ? Cube01 : Folder}
            label={getPath(index, folder.id)
              .slice(getPath(index, podFolderId).length - 1)
              .map((n) => n.name)
              .join(" / ")}
            onClick={(e) => {
              e.stopPropagation();
              onSave(folder.id);
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentView({
  name,
  visual,
  location,
  query,
  actions,
  onClose,
}: {
  name: string;
  visual: IconType;
  location: string;
  query: string | null;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Icon visual={visual} size="md" />
            <h1 className="heading-2xl truncate text-foreground">{name}</h1>
          </div>
          <span className="text-xs text-muted-foreground">{location}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <Button
            size="sm"
            variant="ghost-secondary"
            icon={XClose}
            tooltip="Back to the folder"
            onClick={onClose}
          />
        </div>
      </div>
      {/* Placeholder body: the editor is out of scope for this prototype. */}
      <div className="flex flex-col gap-4 text-sm text-foreground">
        <div className="h-3 w-2/3 rounded bg-muted-foreground/15" />
        <div className="h-3 w-full rounded bg-muted-foreground/15" />
        <div className="h-3 w-5/6 rounded bg-muted-foreground/15" />
        {query && (
          <div className="flex flex-col gap-2 rounded-xl bg-highlight-50 p-3">
            <span className="text-xs font-medium text-highlight-500">
              Matches “{query}”
            </span>
            <div className="h-3 w-full rounded bg-highlight-200" />
            <div className="h-3 w-3/4 rounded bg-highlight-200" />
          </div>
        )}
        <div className="h-3 w-full rounded bg-muted-foreground/15" />
        <div className="h-3 w-4/5 rounded bg-muted-foreground/15" />
        <div className="h-3 w-2/3 rounded bg-muted-foreground/15" />
      </div>
    </div>
  );
}

function DraftsSection({
  drafts,
  conversations,
  index,
  dragPropsFor,
  onOpen,
  onSave,
}: {
  drafts: ConversationDraft[];
  conversations: PodConversation[];
  index: FsIndex;
  dragPropsFor: (draftId: string) => React.HTMLAttributes<HTMLDivElement>;
  onOpen: (draft: ConversationDraft) => void;
  onSave: (draftId: string, folderId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const conversationById = useMemo(
    () => new Map(conversations.map((c) => [c.id, c])),
    [conversations]
  );
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        title="Drafts in conversations"
        description={`${pluralize(drafts.length, "draft")} not saved to a folder. Agents only read them inside their conversation.`}
        action={
          <Button
            size="sm"
            variant="ghost-secondary"
            label={isOpen ? "Hide" : "Show"}
            onClick={() => setIsOpen((v) => !v)}
          />
        }
      />
      {isOpen && (
        <div className="flex flex-col">
          {drafts.map((d) => {
            const conv = conversationById.get(d.conversationId);
            return (
              <div
                key={d.id}
                {...dragPropsFor(d.id)}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-hover"
                onClick={() => onOpen(d)}
              >
                <Icon
                  visual={getIconForFileType(d.fileType)}
                  size="sm"
                  className="text-muted-foreground"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {d.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    In “{conv?.title}” · {formatAgo(d.createdAt)}
                  </span>
                </div>
                {conv && (
                  <SaveDraftMenu
                    size="xs"
                    index={index}
                    podFolderId={conv.podFolderId}
                    onSave={(folderId) => onSave(d.id, folderId)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversationRail({
  pod,
  podName,
  conversations,
  draftsByConversationId,
  openedName,
  dragPropsFor,
  onStart,
  onOpen,
}: {
  pod: Pod;
  podName: string;
  conversations: PodConversation[];
  draftsByConversationId: Map<string, ConversationDraft[]>;
  openedName: string | null;
  dragPropsFor: (
    conversationId: string
  ) => React.HTMLAttributes<HTMLDivElement>;
  onStart: () => void;
  onOpen: (id: string) => void;
}) {
  const linkedCount = pod.attachments.length;
  const placeholder = openedName
    ? `Ask about ${openedName}`
    : `Ask in ${podName}`;
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto px-4 py-4">
      <div className="flex flex-col gap-2">
        <InputBar
          // InputBar reads its placeholder on mount only.
          key={placeholder}
          isFloating={false}
          placeholder={placeholder}
          onSend={onStart}
        />
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <Chip size="mini" icon={Cube01} label={podName} />
          {linkedCount > 0 && (
            <Chip
              size="mini"
              icon={Link01}
              label={`${linkedCount} from other folders`}
            />
          )}
        </div>
      </div>
      {conversations.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">
          No conversations yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {conversations.map((c) => {
            const agent = getAgentById(c.agentId);
            const author = getFsUserById(c.authorId);
            const unsaved = (draftsByConversationId.get(c.id) ?? []).filter(
              (d) => d.savedNodeId === null
            ).length;
            return (
              <div key={c.id} {...dragPropsFor(c.id)}>
                <ConversationListItem
                  conversation={{
                    id: c.id,
                    title: c.title,
                    description: [
                      author?.firstName,
                      `@${agent?.name}`,
                      unsaved > 0 ? pluralize(unsaved, "draft") : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    updatedAt: c.updatedAt,
                  }}
                  // An avatar instead of `creator` keeps the name off the
                  // title line, which the narrow column needs for the title.
                  avatar={{
                    name: author?.fullName,
                    visual: author?.portrait,
                    isRounded: true,
                  }}
                  className="rounded-2xl border-b-0 border-t-0 hover:bg-hover"
                  time={formatAgo(c.updatedAt)}
                  unread={c.isUnread}
                  onClick={() => onOpen(c.id)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Builds the messages ConversationView renders: the question, then the
 * agent's answer citing its search results and listing the drafts it wrote
 * as file chips. A conversation started in the prototype has no messages.
 */
function toViewConversation(
  conversation: PodConversation,
  drafts: ConversationDraft[],
  index: FsIndex
): Conversation {
  const base: Conversation = {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.updatedAt,
    updatedAt: conversation.updatedAt,
    userParticipants: [conversation.authorId],
    agentParticipants: [conversation.agentId],
  };
  const results = conversation.citedNodeIds.flatMap((id) => {
    const n = index.byId.get(id);
    return n ? [n] : [];
  });
  if (results.length === 0 && drafts.length === 0) {
    return { ...base, messages: [] };
  }

  const agent = getAgentById(conversation.agentId);
  const isMine = conversation.authorId === CURRENT_USER_ID;
  const author = getFsUserById(conversation.authorId);
  const draftLines = drafts.map((d) => {
    const saved = d.savedNodeId
      ? ` (saved to ${getPath(index, d.savedNodeId)
          .slice(0, -1)
          .map((n) => n.name)
          .pop()})`
      : "";
    return `- :file[${d.name}]{type=${d.fileType} id=${d.id}}${saved}`;
  });
  const markdown = [
    results.length > 0
      ? `I searched for “${conversation.searchQuery}” and used ${pluralize(results.length, "document")}.`
      : "",
    drafts.length > 0
      ? `Here ${drafts.length === 1 ? "is a draft" : `are ${drafts.length} drafts`}:\n\n${draftLines.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    ...base,
    messages: [
      {
        kind: "message",
        id: `${conversation.id}-question`,
        content: conversation.title,
        timestamp: conversation.updatedAt,
        ownerId: conversation.authorId,
        ownerType: "user",
        type: "user",
        group: {
          id: `${conversation.id}-group-user`,
          type: isMine ? "locutor" : "interlocutor",
          name: isMine ? undefined : author?.fullName,
          avatar: { visual: author?.portrait, isRounded: true },
        },
      },
      {
        kind: "message",
        id: `${conversation.id}-answer`,
        markdown,
        citations: results.map((n) => ({
          id: n.id,
          title: n.name,
          icon:
            n.kind === "folder"
              ? "document"
              : n.fileType === "xlsx" || n.fileType === "csv"
                ? "table"
                : "document",
        })),
        timestamp: conversation.updatedAt,
        ownerId: conversation.agentId,
        ownerType: "agent",
        type: "agent",
        group: {
          id: `${conversation.id}-group-agent`,
          type: "agent",
          name: agent?.name,
          avatar: {
            emoji: agent?.emoji,
            backgroundColor: agent?.backgroundColor,
          },
        },
      },
    ],
  };
}

function SearchResults({
  matches,
  index,
  visualFor,
  onSelect,
}: {
  matches: FsNode[];
  index: FsIndex;
  visualFor: (n: FsNode) => IconType;
  onSelect: (id: string) => void;
}) {
  if (matches.length === 0) {
    return <p className="px-2 text-sm text-muted-foreground">No match.</p>;
  }
  return (
    <Tree variant="navigator">
      {matches.map((n) => (
        <Tree.Item
          key={n.id}
          type="item"
          label={`${n.name} · ${getPath(index, n.id)[0]?.name}`}
          visual={visualFor(n)}
          onItemClick={() => onSelect(n.id)}
        />
      ))}
    </Tree>
  );
}

function MoveDialog({
  move,
  targetName,
  spaceAccess,
  spaceName,
  onCancel,
  onConfirm,
}: {
  move: PendingMove;
  targetName: string;
  spaceAccess: Record<string, FsSpaceAccess>;
  spaceName: (id: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const from = spaceAccess[move.fromSpaceId];
  const to = spaceAccess[move.toSpaceId];
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Move “{move.name}” to {targetName}?
          </DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">This changes who can see it.</p>
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Icon
                visual={from?.isRestricted ? Lock01 : Building01}
                size="xs"
              />
              Now: {spaceName(move.fromSpaceId)} ({accessLabel(from)})
            </div>
            <div className="flex items-center gap-2">
              <Icon visual={to?.isRestricted ? Lock01 : Building01} size="xs" />
              After: {spaceName(move.toSpaceId)} ({accessLabel(to)})
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onCancel,
          }}
          rightButtonProps={{
            label: "Move",
            variant: "primary",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AttachDialog({
  pod,
  index,
  spaceAccess,
  visualFor,
  onClose,
  onSave,
}: {
  pod: Pod;
  index: FsIndex;
  spaceAccess: Record<string, FsSpaceAccess>;
  visualFor: (n: FsNode) => IconType;
  onClose: () => void;
  onSave: (nodeIds: string[]) => void;
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(pod.attachments.map((a) => a.nodeId))
  );
  const podName = index.byId.get(pod.folderId)?.name;

  const restrictedWarnings = useMemo(
    () =>
      [...checkedIds].flatMap((id) => {
        const { hidden, total } = hiddenFromCount(
          index,
          spaceAccess,
          pod.folderId,
          id
        );
        const node = index.byId.get(id);
        return hidden > 0 && node ? [{ node, hidden, total }] : [];
      }),
    [checkedIds, index, spaceAccess, pod.folderId]
  );

  const toggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderItem = (node: FsNode): React.ReactNode => {
    const children = index.childrenById.get(node.id) ?? [];
    const isOwnFolder = isInside(index, node.id, pod.folderId);
    return (
      <Tree.Item
        key={node.id}
        label={isOwnFolder ? `${node.name} (in this pod)` : node.name}
        visual={visualFor(node)}
        type={children.length > 0 ? "node" : "leaf"}
        checkbox={
          node.kind === "space"
            ? undefined
            : {
                checked: isOwnFolder || checkedIds.has(node.id),
                disabled: isOwnFolder,
                onCheckedChange: () => toggle(node.id),
              }
        }
        renderTreeItems={() => children.map(renderItem)}
      />
    );
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add to {podName} from workspace</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Pick folders or files from anywhere you have access to.
            Conversations in this pod will read them on top of the pod folder.
          </p>
          <div className="max-h-96 overflow-auto rounded-xl border border-border p-2">
            <Tree>{(index.childrenById.get(null) ?? []).map(renderItem)}</Tree>
          </div>
          {restrictedWarnings.length > 0 && (
            <ContentMessage
              variant="golden"
              size="lg"
              icon={Lock01}
              title="Not everyone in this pod can see all of this"
            >
              <ul className="list-disc pl-4">
                {restrictedWarnings.map(({ node, hidden, total }) => (
                  <li key={node.id}>
                    <b>{node.name}</b>: {hidden} of {total} people with access
                    to {podName} can't read it. The agent only uses it for
                    people who can.
                  </li>
                ))}
              </ul>
            </ContentMessage>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: `Save (${checkedIds.size})`,
            variant: "primary",
            onClick: () => onSave([...checkedIds]),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default DustWorkspaceFs;
