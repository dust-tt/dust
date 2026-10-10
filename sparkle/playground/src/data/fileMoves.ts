import type { DataSource } from "./types";

// The rules for moving things around the workspace file system, kept in one
// place so the tree, the files browser and the sidebar all agree on what can
// be picked up and where it may land.

/** A plain file or folder being dragged; the value is the item's id. */
export const WORKSPACE_FILE_DRAG_MIME = "application/x-dust-workspace-file";
/** A Pod folder being dragged; the value is the item's id. */
export const WORKSPACE_POD_DRAG_MIME = "application/x-dust-workspace-pod";

export function indexFilesByParentId(
  files: DataSource[]
): Map<string | null, DataSource[]> {
  const index = new Map<string | null, DataSource[]>();
  for (const file of files) {
    const siblings = index.get(file.parentId);
    if (siblings) {
      siblings.push(file);
    } else {
      index.set(file.parentId, [file]);
    }
  }
  return index;
}

export function isPodFolder(item: DataSource): boolean {
  return item.kind === "folder" && item.folderType === "pod";
}

/**
 * Every file can be picked up, agents and skills included: where an agent is
 * filed is a choice, not a given. Of the folders, only plain ones and Pods
 * move — the two drives, Company Spaces, conversations and the Dust-owned
 * `Conversations` folder are structural.
 */
export function isDraggableItem(item: DataSource): boolean {
  if (item.kind === "folder") {
    return item.folderType === undefined || item.folderType === "pod";
  }
  return true;
}

/** Any folder that is not a conversation or system one. */
export function isDropTargetFolder(item: DataSource): boolean {
  return (
    item.kind === "folder" &&
    item.folderType !== "conversation" &&
    item.folderType !== "system"
  );
}

export function dragMimeFor(item: DataSource): string {
  return isPodFolder(item) ? WORKSPACE_POD_DRAG_MIME : WORKSPACE_FILE_DRAG_MIME;
}

/** The dragged item's id, whichever of the two kinds the drag carries. */
export function readDragId(dataTransfer: DataTransfer): string | null {
  return (
    dataTransfer.getData(WORKSPACE_POD_DRAG_MIME) ||
    dataTransfer.getData(WORKSPACE_FILE_DRAG_MIME) ||
    null
  );
}

export function readPodDragId(dataTransfer: DataTransfer): string | null {
  return dataTransfer.getData(WORKSPACE_POD_DRAG_MIME) || null;
}

/** `types` is readable during dragover, where `getData` returns "". */
export function hasPodDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(WORKSPACE_POD_DRAG_MIME);
}

export function readFileDragId(dataTransfer: DataTransfer): string | null {
  return dataTransfer.getData(WORKSPACE_FILE_DRAG_MIME) || null;
}

export function hasFileDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(WORKSPACE_FILE_DRAG_MIME);
}

/**
 * What the sidebar's Files section keeps. Anything that can be picked up can
 * be kept there, a Pod aside: it has a list of its own, which is where its
 * drag lands.
 */
export function isPinnableToSidebar(item: DataSource): boolean {
  return isDraggableItem(item) && !isPodFolder(item);
}

function ancestorsOf(
  byId: Map<string, DataSource>,
  folderId: string | null
): DataSource[] {
  const chain: DataSource[] = [];
  let current = folderId ? byId.get(folderId) : undefined;
  while (current) {
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function indexFilesById(files: DataSource[]): Map<string, DataSource> {
  return new Map(files.map((file) => [file.id, file]));
}

/**
 * Whether a folder can hold items at all. The root holds the two drives and
 * nothing else, so everything lands in one of them rather than beside them.
 * Shared so dropping something and picking a destination in a dialog ask the
 * same question.
 */
export function canContainItems(
  targetFolderId: string | null
): targetFolderId is string {
  return targetFolderId !== null;
}

/**
 * Takes the id index rather than the file list: `dragover` fires on every
 * pixel, and a workspace holds thousands of items.
 */
export function canDropInto(
  byId: Map<string, DataSource>,
  draggedId: string,
  targetFolderId: string | null
): boolean {
  const dragged = byId.get(draggedId);
  if (!dragged || !isDraggableItem(dragged)) {
    return false;
  }
  if (draggedId === targetFolderId || dragged.parentId === targetFolderId) {
    return false;
  }

  if (!canContainItems(targetFolderId)) {
    return false;
  }

  const target = byId.get(targetFolderId);
  if (!target || !isDropTargetFolder(target)) {
    return false;
  }

  const targetChain = ancestorsOf(byId, targetFolderId);
  // A folder cannot be filed inside itself.
  if (targetChain.some((folder) => folder.id === draggedId)) {
    return false;
  }
  // A Pod never nests in another Pod, however deep the target sits.
  if (isPodFolder(dragged) && targetChain.some(isPodFolder)) {
    return false;
  }
  return true;
}

/**
 * The contents of each given folder, rooted at `null` the way a Pod's or a
 * conversation's own Files panel expects them. Reading these off the live file
 * list is what makes a move in the Files view show up in the Pod that owns it.
 *
 * Keyed by `refId`, the Pod or conversation the folder stands for. Pass
 * `skipSystemFolders` to leave out the Dust-owned `Conversations` branch,
 * which a Pod's Files tab does not list.
 */
export function deriveFolderFiles(
  byParentId: Map<string | null, DataSource[]>,
  roots: DataSource[],
  { skipSystemFolders = false }: { skipSystemFolders?: boolean } = {}
): Map<string, DataSource[]> {
  const result = new Map<string, DataSource[]>();

  for (const root of roots) {
    if (!root.refId) {
      continue;
    }
    const collected: DataSource[] = [];
    const queue: { id: string; isRoot: boolean }[] = [
      { id: root.id, isRoot: true },
    ];

    while (queue.length > 0) {
      const { id, isRoot } = queue.shift() as { id: string; isRoot: boolean };
      for (const child of byParentId.get(id) ?? []) {
        if (skipSystemFolders && child.folderType === "system") {
          continue;
        }
        collected.push(isRoot ? { ...child, parentId: null } : child);
        if (child.kind === "folder") {
          queue.push({ id: child.id, isRoot: false });
        }
      }
    }

    result.set(root.refId, collected);
  }

  return result;
}

/** The same list with the one item re-parented, keeping the original order. */
export function moveDataSource(
  files: DataSource[],
  draggedId: string,
  targetFolderId: string | null
): DataSource[] {
  return files.map((file) =>
    file.id === draggedId ? { ...file, parentId: targetFolderId } : file
  );
}
