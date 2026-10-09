import {
  Button,
  Folder,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import {
  type DragEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getDataSourceIcon,
  getFolderPath,
  isDataSourceFolder,
  ROOT_FOLDER_ICON,
  ROOT_FOLDER_LABEL,
  sortDataSourcesForDisplay,
} from "../data/dataSources";
import {
  canDropInto,
  dragMimeFor,
  isDraggableItem,
  isDropTargetFolder,
  readDragId,
} from "../data/fileMoves";
import type { DataSource } from "../data/types";
import {
  type CreatableFileType,
  FilesBrowser,
  type FilesBrowserDnd,
} from "./FilesBrowser";
import { TreeDnd } from "./TreeDnd";

// The workspace file system as a single panel split in two: a folder tree on
// the left, the files browser on the right, both looking at the same current
// folder. Everything the workspace holds — Company Spaces, Pods, their
// conversations, agents and skills — is in the one tree.
//
// Items are moved by dragging them, in the tree, in the table, or onto a
// breadcrumb. What may be picked up and where it may land is decided in
// `data/fileMoves`, not here.

/** Below this width the tree folds into a dropdown, taking the trail's place. */
const COMPACT_BELOW = 720;

/** The breadcrumbs name the workspace root this way; the model calls it null. */
const ROOT_TARGET_ID = "root";

/** The folders above this one, which the tree has to open to show it. */
function ancestorIdsOf(
  filesById: Map<string, DataSource>,
  folderId: string | null
): string[] {
  return getFolderPath(filesById, folderId)
    .slice(0, -1)
    .map((folder) => folder.id);
}

interface WorkspaceFileSystemProps {
  files: DataSource[];
  /** The tree's children index, so a branch never scans the whole workspace. */
  filesByParentId: Map<string | null, DataSource[]>;
  /** The same items by id, for the drop checks `dragover` runs constantly. */
  filesById: Map<string, DataSource>;
  onFileOpen: (dataSource: DataSource) => void;
  /** Row menu: what each item leads to away from the Hub. */
  onStartConversation: (dataSource: DataSource) => void;
  onOpenPod: (dataSource: DataSource) => void;
  onEditBuildItem: (dataSource: DataSource) => void;
  onMoveFile: (draggedId: string, targetFolderId: string | null) => void;
  /** Opens the Pod creation dialog on the given folder. */
  onCreatePod: (parentId: string | null) => void;
  /** Creates a file of the given type in the given folder, and opens it. */
  onCreateFile: (fileType: CreatableFileType, parentId: string | null) => void;
  /** Controlled: the search input lives in the screen's header, not here. */
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** Controlled too: the sidebar opens the Hub on a kept folder, and lights
   *  that row while the Hub is in it. */
  currentFolderId: string | null;
  onCurrentFolderIdChange: (folderId: string | null) => void;
  isPinnedToSidebar: (dataSource: DataSource) => boolean;
  onTogglePinnedToSidebar: (dataSource: DataSource) => void;
}

export function WorkspaceFileSystem({
  files,
  filesByParentId,
  filesById,
  onFileOpen,
  onStartConversation,
  onOpenPod,
  onEditBuildItem,
  onMoveFile,
  onCreatePod,
  onCreateFile,
  searchText,
  onSearchTextChange,
  currentFolderId,
  onCurrentFolderIdChange,
  isPinnedToSidebar,
  onTogglePinnedToSidebar,
}: WorkspaceFileSystemProps) {
  // The top level opens itself: it holds only the two drives, which say nothing
  // about what the workspace keeps until you look inside one.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () =>
      new Set([
        ...(filesByParentId.get(null) ?? [])
          .filter(isDataSourceFolder)
          .map((folder) => folder.id),
        ...ancestorIdsOf(filesById, currentFolderId),
      ])
  );

  // Opening a folder from anywhere — the tree, the table, the sidebar —
  // reveals it in the tree. Adjusted during render rather than in an effect so
  // the tree never paints once with the folder hidden.
  const [revealedFolderId, setRevealedFolderId] = useState(currentFolderId);
  if (currentFolderId !== revealedFolderId) {
    setRevealedFolderId(currentFolderId);
    const ancestors = ancestorIdsOf(filesById, currentFolderId);
    if (ancestors.length > 0) {
      setExpandedIds((prev) => new Set([...prev, ...ancestors]));
    }
  }
  const [isTreeMenuOpen, setIsTreeMenuOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // `dragover` can fire before React has re-rendered on the `dragstart`, so
  // the checks read the carried item from here rather than from state.
  const draggingIdRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const measure = () =>
      setIsCompact(el.getBoundingClientRect().width < COMPACT_BELOW);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const subfoldersByParentId = useMemo(() => {
    const index = new Map<string | null, DataSource[]>();
    filesByParentId.forEach((children, parentId) => {
      const folders = children.filter(isDataSourceFolder);
      if (folders.length > 0) {
        index.set(parentId, folders);
      }
    });
    return index;
  }, [filesByParentId]);

  const toggleExpanded = (folderId: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });

  const selectFolder = (folderId: string | null) => {
    onCurrentFolderIdChange(folderId);
    setIsTreeMenuOpen(false);
  };

  const getSubfolders = (parentId: string | null) =>
    subfoldersByParentId.get(parentId) ?? [];

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const startDrag = (item: DataSource, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(dragMimeFor(item), item.id);
    event.dataTransfer.setData("text/plain", item.fileName);
    draggingIdRef.current = item.id;
    setDraggingId(item.id);
  };

  const endDrag = () => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  };

  const dragOverTarget = (
    targetId: string,
    targetFolderId: string | null,
    event: DragEvent<HTMLElement>
  ) => {
    const carried = draggingIdRef.current;
    if (!carried || !canDropInto(filesById, carried, targetFolderId)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  };

  const dropOnTarget = (
    targetFolderId: string | null,
    event: DragEvent<HTMLElement>
  ) => {
    const droppedId = readDragId(event.dataTransfer) ?? draggingIdRef.current;
    endDrag();
    if (!droppedId) {
      return;
    }
    event.preventDefault();
    onMoveFile(droppedId, targetFolderId);
  };

  /** The whole drop contract for one tree row, or nothing if it cannot take one. */
  const dropPropsFor = (folder: DataSource | null) => {
    const targetId = folder?.id ?? ROOT_TARGET_ID;
    const targetFolderId = folder?.id ?? null;
    if (folder && !isDropTargetFolder(folder)) {
      return {};
    }
    return {
      onDragOver: (event: DragEvent<HTMLDivElement>) =>
        dragOverTarget(targetId, targetFolderId, event),
      onDragLeave: () =>
        setDropTargetId((prev) => (prev === targetId ? null : prev)),
      onDrop: (event: DragEvent<HTMLDivElement>) =>
        dropOnTarget(targetFolderId, event),
      isDropHighlight: dropTargetId === targetId,
    };
  };

  const renderFolder = (folder: DataSource) => {
    const subfolders = getSubfolders(folder.id);
    const shared = {
      label: folder.fileName,
      visual: getDataSourceIcon(folder) ?? Folder,
      isSelected: currentFolderId === folder.id,
      onItemClick: () => selectFolder(folder.id),
      draggable: isDraggableItem(folder),
      onDragStart: (event: DragEvent<HTMLDivElement>) =>
        startDrag(folder, event),
      onDragEnd: endDrag,
      isDragging: draggingId === folder.id,
      ...dropPropsFor(folder),
    };

    if (subfolders.length === 0) {
      return <TreeDnd.Item key={folder.id} {...shared} type="leaf" />;
    }

    return (
      <TreeDnd.Item
        key={folder.id}
        {...shared}
        type="node"
        collapsed={!expandedIds.has(folder.id)}
        onChevronClick={() => toggleExpanded(folder.id)}
        renderTreeItems={() => (
          <TreeDnd variant="navigator">
            {sortDataSourcesForDisplay(subfolders).map(renderFolder)}
          </TreeDnd>
        )}
      />
    );
  };

  // The top level is reached, and dropped onto, through the "Hub" breadcrumb.
  const tree = (
    <TreeDnd variant="navigator">
      {sortDataSourcesForDisplay(getSubfolders(null)).map(renderFolder)}
    </TreeDnd>
  );

  const currentFolder = currentFolderId
    ? files.find((item) => item.id === currentFolderId)
    : undefined;

  const browserDnd: FilesBrowserDnd = {
    draggingFileId: draggingId,
    dropHoverTargetId: dropTargetId,
    onDragOverTarget: (targetId, event) =>
      dragOverTarget(
        targetId,
        targetId === ROOT_TARGET_ID ? null : targetId,
        event
      ),
    onDropOnTarget: (targetId, _targetParentId, event) =>
      dropOnTarget(targetId === ROOT_TARGET_ID ? null : targetId, event),
    onFileDragStart: (fileId, _fileName, event) => {
      const item = filesById.get(fileId);
      if (item) {
        startDrag(item, event);
      }
    },
    onFileDragEnd: endDrag,
    canDragRow: isDraggableItem,
    canDropOn: (item) =>
      isDropTargetFolder(item) &&
      (!draggingId || canDropInto(filesById, draggingId, item.id)),
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      {!isCompact && (
        <aside className="flex w-64 flex-none flex-col overflow-y-auto p-2 pt-3">
          {tree}
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <FilesBrowser
          dataSources={files}
          searchText={searchText}
          onSearchTextChange={onSearchTextChange}
          hasSearchInput={false}
          // Too narrow for the sidebar: the tree takes the trail's place,
          // naming the open folder the way the trail did and opening on the
          // whole tree rather than only the ancestors the trail held.
          trailSlot={
            isCompact ? (
              <PopoverRoot
                open={isTreeMenuOpen}
                onOpenChange={setIsTreeMenuOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    isSelect
                    hasLighterFont
                    icon={
                      currentFolder
                        ? (getDataSourceIcon(currentFolder) ?? Folder)
                        : ROOT_FOLDER_ICON
                    }
                    label={currentFolder?.fileName ?? ROOT_FOLDER_LABEL}
                  />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-[60vh] w-72 overflow-y-auto p-2"
                >
                  {tree}
                </PopoverContent>
              </PopoverRoot>
            ) : undefined
          }
          currentFolderId={currentFolderId}
          onCurrentFolderIdChange={onCurrentFolderIdChange}
          isPinnedToSidebar={isPinnedToSidebar}
          onTogglePinnedToSidebar={onTogglePinnedToSidebar}
          onFileOpen={onFileOpen}
          onStartConversation={onStartConversation}
          onOpenPod={onOpenPod}
          onEditBuildItem={onEditBuildItem}
          onDeleteFile={() => {}}
          onCreatePod={() => onCreatePod(currentFolderId)}
          onCreateFile={(fileType) => onCreateFile(fileType, currentFolderId)}
          dnd={browserDnd}
          emptyMessage="No files in this workspace yet."
        />
      </div>
    </div>
  );
}
