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
  Folder,
  Icon,
  InfoCircle,
  Input,
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

import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
} from "../components/PanelLayout";
import { getAgentById } from "../data/agents";
import { getIconForFileType } from "../data/dataSources";
import { getUserById } from "../data/users";
import {
  buildWorkspaceFs,
  countFiles,
  CURRENT_USER_ID,
  MY_FILES_ID,
  type FsIndex,
  type FsNode,
  type FsSpaceAccess,
  getEnclosingPodId,
  getPath,
  getSpaceId,
  indexFs,
  isInside,
  type Pod,
  type PodConversation,
} from "../data/workspaceFs";

type IconType = ComponentType<{ className?: string }>;

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
  const { nodes, spaceAccess } = initial;
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
        Math.max(320, Math.min(rect.width * 0.6, rect.right - ev.clientX))
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
  const [promoteFolderId, setPromoteFolderId] = useState<string | null>(null);
  const [attachPodId, setAttachPodId] = useState<string | null>(null);

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

  const promoteFolder = (folderId: string, description: string) => {
    setPods((prev) => [
      ...prev,
      { folderId, description, attachments: [], createdAt: new Date() },
    ]);
    setPromoteFolderId(null);
    navigate(folderId);
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
      <Tree.Item
        key={node.id}
        label={node.name}
        visual={nodeVisual(node)}
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
      </Tree.Item>
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
              <Tree variant="navigator">
                {myFilesNode && renderTreeNode(myFilesNode)}
              </Tree>
              <div className="px-2 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
                Workspace
              </div>
              <Tree variant="navigator">
                {workspaceRoots.map(renderTreeNode)}
              </Tree>
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
  const breadcrumbs = selected ? (
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

  const mainContent = selected && (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
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
          ) : selected.kind === "folder" ? (
            <Button
              variant="outline"
              size="sm"
              icon={Cube01}
              label="Make it a pod"
              onClick={() => setPromoteFolderId(selected.id)}
            />
          ) : null
        }
      />

      {!selectedPod && enclosingPodId && (
        <ContentMessage
          variant="primary"
          size="lg"
          icon={Cube01}
          title={`Part of the ${index.byId.get(enclosingPodId)?.name} pod`}
          action={
            <Button
              size="xs"
              variant="outline"
              label="Open pod"
              onClick={() => navigate(enclosingPodId)}
            />
          }
        >
          Conversations in that pod can read everything in this folder.
        </ContentMessage>
      )}

      {selectedPod ? (
        <PodContext
          pod={selectedPod}
          index={index}
          spaceAccess={spaceAccess}
          visualFor={nodeVisual}
          citedIds={citedIds}
          onNavigate={navigate}
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
          onOpen={navigate}
          emptyLabel="This folder is empty."
        />
      )}
    </div>
  );

  const railPod = enclosingPodId ? podById.get(enclosingPodId) : undefined;
  const railPodName = railPod ? index.byId.get(railPod.folderId)?.name : "";

  const railTopBarLeft = openConversationData ? (
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
            {railPod && isRailOpen && (
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
                    railWidth === null && "w-[clamp(24rem,32%,44rem)]"
                  )}
                  style={railWidth === null ? undefined : { width: railWidth }}
                >
                  <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
                    {railTopBarLeft}
                    <Button
                      size="xmini"
                      variant="ghost-secondary"
                      icon={XClose}
                      tooltip="Hide conversations"
                      onClick={() => {
                        setIsRailOpen(false);
                        setOpenConversationId(null);
                      }}
                    />
                  </div>
                  <div className="min-h-0 flex-1">
                    {openConversationData ? (
                      <ConversationStub
                        conversation={openConversationData}
                        index={index}
                        visualFor={nodeVisual}
                        onNavigate={navigate}
                      />
                    ) : (
                      <ConversationRail
                        pod={railPod}
                        podName={railPodName ?? ""}
                        conversations={railConversations}
                        onStart={() => startConversation(railPod.folderId)}
                        onOpen={openConversation}
                      />
                    )}
                  </div>
                </aside>
              </>
            )}
          </div>
        </PanelLayoutPanel>
      </PanelLayout>

      <PromoteDialog
        folderId={promoteFolderId}
        index={index}
        spaceAccess={spaceAccess}
        enclosingPodId={
          promoteFolderId
            ? getEnclosingPodId(index, podIds, promoteFolderId)
            : null
        }
        onClose={() => setPromoteFolderId(null)}
        onConfirm={promoteFolder}
      />

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
    <div className="flex items-start justify-between gap-4">
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
  trailing,
  isCited = false,
}: {
  node: FsNode;
  index: FsIndex;
  visual: IconType;
  onOpen: () => void;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  isCited?: boolean;
}) {
  const author = getUserById(node.updatedById);
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
        isCited ? "bg-highlight-50" : "hover:bg-hover"
      )}
      onClick={onOpen}
    >
      <Icon visual={visual} size="sm" className="text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {node.name}
        </span>
        {meta && (
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
        )}
      </div>
      {isCited && <Chip size="mini" color="highlight" label="Cited" />}
      {node.kind !== "file" && (
        <span className="text-xs text-muted-foreground">
          {pluralize(countFiles(index, node.id), "file")}
        </span>
      )}
      {author && (
        <Avatar size="xs" name={author.fullName} visual={author.portrait} />
      )}
      <span className="w-20 text-right text-xs text-muted-foreground">
        {formatAgo(node.updatedAt)}
      </span>
      {trailing}
    </div>
  );
}

function NodeList({
  nodes,
  index,
  visualFor,
  citedIds,
  onOpen,
  emptyLabel,
}: {
  nodes: FsNode[];
  index: FsIndex;
  visualFor: (n: FsNode) => IconType;
  citedIds: Set<string>;
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
  onNavigate,
  onAttach,
  onDetach,
}: {
  pod: Pod;
  index: FsIndex;
  spaceAccess: Record<string, FsSpaceAccess>;
  visualFor: (n: FsNode) => IconType;
  citedIds: Set<string>;
  onNavigate: (id: string) => void;
  onAttach: () => void;
  onDetach: (nodeId: string) => void;
}) {
  const ownFiles = countFiles(index, pod.folderId);
  return (
    <>
      <div className="flex flex-col gap-2">
        <SectionHeader
          title="In this folder"
          description={`Available by default · ${pluralize(ownFiles, "file")}`}
        />
        <NodeList
          nodes={index.childrenById.get(pod.folderId) ?? []}
          index={index}
          visualFor={visualFor}
          citedIds={citedIds}
          onOpen={onNavigate}
          emptyLabel="Nothing here yet. Drop files in this folder to give the pod context."
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionHeader
          title="From other folders"
          action={
            <Button
              size="sm"
              variant="outline"
              icon={Link01}
              label="Add from workspace"
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
                    getUserById(a.addedById)?.firstName ?? "someone"
                  }`}
                  trailing={
                    <div className="flex items-center gap-1">
                      {hidden > 0 && (
                        <Chip
                          size="mini"
                          color="info"
                          icon={Lock01}
                          label={`${total - hidden}/${total} can see`}
                        />
                      )}
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
                    </div>
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

function ConversationRail({
  pod,
  podName,
  conversations,
  onStart,
  onOpen,
}: {
  pod: Pod;
  podName: string;
  conversations: PodConversation[];
  onStart: () => void;
  onOpen: (id: string) => void;
}) {
  const linkedCount = pod.attachments.length;
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto px-4 py-4">
      <div
        className="flex cursor-text flex-col gap-2 rounded-2xl border border-border bg-background px-4 py-3"
        onClick={onStart}
      >
        <span className="text-sm text-muted-foreground">Ask in {podName}…</span>
        <div className="flex flex-wrap items-center gap-1.5">
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
            const author = getUserById(c.authorId);
            return (
              <div
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover"
                onClick={() => onOpen(c.id)}
              >
                <Avatar
                  size="sm"
                  emoji={agent?.emoji}
                  backgroundColor={agent?.backgroundColor}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-sm text-foreground",
                      c.isUnread ? "font-semibold" : "font-medium"
                    )}
                  >
                    {c.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {author?.firstName} · {formatAgo(c.updatedAt)}
                  </span>
                </div>
                {c.isUnread && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-highlight-500" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversationStub({
  conversation,
  index,
  visualFor,
  onNavigate,
}: {
  conversation: PodConversation;
  index: FsIndex;
  visualFor: (n: FsNode) => IconType;
  onNavigate: (id: string) => void;
}) {
  const agent = getAgentById(conversation.agentId);
  const author = getUserById(conversation.authorId);
  const cited = conversation.citedNodeIds.flatMap((id) => {
    const n = index.byId.get(id);
    return n ? [n] : [];
  });
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-6 overflow-auto px-4 py-6">
        {cited.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask a question to get started.
          </p>
        ) : (
          <>
            <div className="flex gap-3">
              <Avatar
                size="sm"
                name={author?.fullName}
                visual={author?.portrait}
              />
              <p className="text-sm text-foreground">{conversation.title}</p>
            </div>
            <div className="flex gap-3">
              <Avatar
                size="sm"
                emoji={agent?.emoji}
                backgroundColor={agent?.backgroundColor}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm text-foreground">
                  Here's a first pass, based on the documents below.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cited.map((n) => (
                    <Chip
                      key={n.id}
                      size="mini"
                      icon={visualFor(n)}
                      label={n.name}
                      onClick={() => onNavigate(n.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="px-4 py-4">
        <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          Reply to @{agent?.name}…
        </div>
      </div>
    </div>
  );
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

function PromoteDialog({
  folderId,
  index,
  spaceAccess,
  enclosingPodId,
  onClose,
  onConfirm,
}: {
  folderId: string | null;
  index: FsIndex;
  spaceAccess: Record<string, FsSpaceAccess>;
  enclosingPodId: string | null;
  onClose: () => void;
  onConfirm: (folderId: string, description: string) => void;
}) {
  const [description, setDescription] = useState("");
  const folder = folderId ? index.byId.get(folderId) : undefined;
  const space = folderId
    ? index.byId.get(getSpaceId(index, folderId))
    : undefined;
  const access = space ? spaceAccess[space.id] : undefined;

  const close = () => {
    setDescription("");
    onClose();
  };

  return (
    <Dialog open={folder !== undefined} onOpenChange={(o) => !o && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Make “{folder?.name}” a pod</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            A pod is a folder you work from. Conversations started here read
            this folder by default, and you can add more from your workspace
            later.
          </p>
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center gap-2">
              <Icon visual={Link01} size="xs" />
              Context:{" "}
              {pluralize(folderId ? countFiles(index, folderId) : 0, "file")} in
              this folder
            </div>
            <div className="flex items-center gap-2">
              <Icon
                visual={access?.isRestricted ? Lock01 : Building01}
                size="xs"
              />
              Access: same as {space?.name} ({accessLabel(access)})
            </div>
          </div>
          {enclosingPodId && enclosingPodId !== folderId && (
            <ContentMessage variant="blue" size="lg" icon={InfoCircle}>
              This folder is inside the {index.byId.get(enclosingPodId)?.name}{" "}
              pod. It becomes its own pod, and{" "}
              {index.byId.get(enclosingPodId)?.name} keeps reading it.
            </ContentMessage>
          )}
          <Input
            label="Description (optional)"
            placeholder="What is this pod for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: close,
          }}
          rightButtonProps={{
            label: "Make it a pod",
            variant: "primary",
            onClick: () => {
              if (folderId) {
                onConfirm(folderId, description.trim());
                setDescription("");
              }
            },
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
