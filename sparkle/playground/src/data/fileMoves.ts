import type { DataSource } from "./types";

// The rules for moving things around the workspace file system, kept in one
// place so the tree, the files browser and the sidebar all agree on what can
// be picked up and where it may land.

/** A plain file or folder being dragged; the value is the item's id. */
export const WORKSPACE_FILE_DRAG_MIME = "application/x-dust-workspace-file";
/** A Pod file being dragged; the value is the item's id. */
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

export function isPodFile(item: DataSource): boolean {
  return item.kind === "file" && item.fileType === "pod";
}

/**
 * @cc [owner:spolu,label:product] movable-pods-and-skills
 * Pod and skill files MUST be movable to the workspace root or any ordinary folder.
 * Pods MUST NOT accept children or act as drop targets.
 */
export function isDraggableItem(item: DataSource): boolean {
  if (item.kind === "folder") {
    return item.folderType === undefined;
  }
  return item.fileType !== "agent";
}

/** The workspace root and any folder that is not a conversation or system one. */
export function isDropTargetFolder(item: DataSource): boolean {
  return (
    item.kind === "folder" &&
    item.folderType !== "conversation" &&
    item.folderType !== "system"
  );
}

export function dragMimeFor(item: DataSource): string {
  return isPodFile(item) ? WORKSPACE_POD_DRAG_MIME : WORKSPACE_FILE_DRAG_MIME;
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

  const target = targetFolderId ? byId.get(targetFolderId) : null;
  if (targetFolderId && (!target || !isDropTargetFolder(target))) {
    return false;
  }

  const targetChain = ancestorsOf(byId, targetFolderId);
  // A folder cannot be filed inside itself.
  if (targetChain.some((folder) => folder.id === draggedId)) {
    return false;
  }
  return true;
}

/**
 * @cc [owner:spolu,label:product] pod-files-follow-containing-folder
 * A Pod's Files view MUST show its containing folder's live contents, rooted at null.
 * Moving the Pod MUST change that view without moving its former folder's other files.
 */
export function derivePodFiles(
  byParentId: Map<string | null, DataSource[]>,
  pods: DataSource[]
): Map<string, DataSource[]> {
  const result = new Map<string, DataSource[]>();
  const contentsByFolderId = new Map<string | null, DataSource[]>();

  for (const pod of pods) {
    if (!isPodFile(pod) || !pod.refId) {
      continue;
    }
    const cached = contentsByFolderId.get(pod.parentId);
    if (cached) {
      result.set(pod.refId, cached);
      continue;
    }
    const collected: DataSource[] = [];
    const queue: { id: string | null; isRoot: boolean }[] = [
      { id: pod.parentId, isRoot: true },
    ];

    for (let index = 0; index < queue.length; index++) {
      const { id, isRoot } = queue[index];
      for (const child of byParentId.get(id) ?? []) {
        collected.push(isRoot ? { ...child, parentId: null } : child);
        if (child.kind === "folder") {
          queue.push({ id: child.id, isRoot: false });
        }
      }
    }

    contentsByFolderId.set(pod.parentId, collected);
    result.set(pod.refId, collected);
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
