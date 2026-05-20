import { getFilePreviewConfig } from "@app/components/spaces/FilePreviewSheet";
import type { GCSMountEntry } from "@app/lib/api/files/gcs_mount/files";
import {
  frameSlideshowContentType,
  isInteractiveContentType,
} from "@app/types/files";

import type {
  FileExplorerBucket,
  FileExplorerEntry,
  FileExplorerSortMode,
  FilePanelCategory,
  FileSystemTreeNode,
} from "./types";

export const MIN_FILES_FOR_SEARCH = 10;

export const ROOT_FOLDER_LABEL = "All files";

/**
 * Category display configuration, ordered by priority.
 */
export const CATEGORY_CONFIG: {
  value: FilePanelCategory;
  singular: string;
  plural: string;
}[] = [
  { value: "frame", singular: "Frame", plural: "Frames" },
  { value: "slideshow", singular: "Slideshow", plural: "Slideshows" },
  { value: "image", singular: "Image", plural: "Images" },
  { value: "document", singular: "Document", plural: "Documents" },
  { value: "pdf", singular: "PDF", plural: "PDFs" },
  { value: "table", singular: "Table", plural: "Tables" },
  { value: "audio", singular: "Audio", plural: "Audio" },
  { value: "knowledge", singular: "Knowledge", plural: "Knowledge" },
  { value: "other", singular: "File", plural: "Other" },
];

/**
 * Maps a tree node (file or folder) to its explorer filter bucket. Audio files (and any other
 * unmapped type) return null and only surface under the "All" chip.
 */
export function getFileExplorerBucket(
  node: FileSystemTreeNode
): FileExplorerBucket | null {
  if (node.isDirectory) {
    return "folders";
  }

  const contentType = node.contentType;
  if (!contentType) {
    return null;
  }

  if (isInteractiveContentType(contentType)) {
    return "frames";
  }

  const previewConfig = getFilePreviewConfig(contentType);
  switch (previewConfig.category) {
    case "image":
      return "images";

    case "code":
      return "code";

    case "delimited":
      return "tables";

    case "pdf":
    case "viewer":
    case "markdown":
    case "text":
      return "texts";

    case "frame":
      return "frames";

    default:
      return null;
  }
}

/** Display order: Company Data refs, then folders, then GCS files. */
function getExplorerNodeSortRank(
  node: FileSystemTreeNode,
  entryByRelativePath: Map<string, FileExplorerEntry>
): number {
  if (entryByRelativePath.get(node.path)?.kind === "node") {
    return 0;
  }
  if (node.isDirectory) {
    return 1;
  }
  return 2;
}

/**
 * Compare nodes for the explorer sort modes. Always groups entries as: connected data (content
 * nodes), then folders, then files; within each group the selected sort mode applies.
 */
export function compareTreeNodesForSort(
  a: FileSystemTreeNode,
  b: FileSystemTreeNode,
  sortMode: FileExplorerSortMode,
  entryByRelativePath: Map<string, FileExplorerEntry>
): number {
  const rankDiff =
    getExplorerNodeSortRank(a, entryByRelativePath) -
    getExplorerNodeSortRank(b, entryByRelativePath);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  switch (sortMode) {
    case "name-asc":
      return a.name.localeCompare(b.name);

    case "name-desc":
      return b.name.localeCompare(a.name);

    case "last-modified": {
      // Folders have no timestamp on the tree (they're inferred from file paths). Among files,
      // sort by recency; tie-break by name.
      const ta = entryByRelativePath.get(a.path)?.lastModifiedMs ?? 0;
      const tb = entryByRelativePath.get(b.path)?.lastModifiedMs ?? 0;
      if (tb !== ta) {
        return tb - ta;
      }

      return a.name.localeCompare(b.name);
    }

    default:
      return 0;
  }
}

/**
 * Human-readable singular category for a file MIME type (Image, Frame, PDF, …).
 * Aligns with {@link getCategoryFromContentType}.
 */
export function getSingularFileCategoryLabelForContentType(
  contentType: string
): string {
  const category: FilePanelCategory = isInteractiveContentType(contentType)
    ? contentType === frameSlideshowContentType
      ? "slideshow"
      : "frame"
    : getCategoryFromContentType(contentType);
  const config = CATEGORY_CONFIG.find((c) => c.value === category);
  return config?.singular ?? "File";
}

/**
 * Categorize a file by its content type alone (used for sandbox/mounted files).
 */
export function getCategoryFromContentType(
  contentType: string
): FilePanelCategory {
  const previewConfig = getFilePreviewConfig(contentType);

  switch (previewConfig.category) {
    case "pdf":
      return "pdf";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "delimited":
      return "table";
    case "code":
    case "viewer":
    case "markdown":
    case "text":
      return "document";
    case "frame":
      return "frame";
    default:
      return "other";
  }
}

/**
 * Build a tree from flat file entries by inferring directories from paths.
 * entry.path is a scoped path (e.g. "conversation/subdir/file.png"); the
 * use-case prefix (first segment) is stripped so tree paths start at the
 * sandbox working directory root.
 */
export function buildSandboxTree(
  entries: GCSMountEntry[]
): FileSystemTreeNode[] {
  const root: FileSystemTreeNode[] = [];
  const nodeMap = new Map<string, FileSystemTreeNode>();

  for (const entry of entries.filter((e) => !e.isDirectory)) {
    const slashIdx = entry.path.indexOf("/");
    const relativePath =
      slashIdx >= 0 ? entry.path.slice(slashIdx + 1) : entry.path;

    if (!relativePath) {
      continue;
    }

    const parts = relativePath.split("/");

    // Ensure all ancestor directories exist as nodes.
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]!;
      if (!nodeMap.has(currentPath)) {
        const dirNode: FileSystemTreeNode = {
          name: parts[i]!,
          path: currentPath,
          isDirectory: true,
          contentType: null,
          fileId: null,
          children: [],
        };
        nodeMap.set(currentPath, dirNode);

        const parentPath = currentPath.substring(
          0,
          currentPath.lastIndexOf("/")
        );
        const parent = parentPath ? nodeMap.get(parentPath) : undefined;
        if (parent) {
          parent.children.push(dirNode);
        } else {
          root.push(dirNode);
        }
      }
    }

    // Add the file node.
    const fileNode: FileSystemTreeNode = {
      name: parts[parts.length - 1]!,
      path: relativePath,
      isDirectory: false,
      contentType: entry.contentType,
      fileId: entry.fileId,
      children: [],
    };
    nodeMap.set(relativePath, fileNode);

    const parentPath = relativePath.substring(0, relativePath.lastIndexOf("/"));
    const parent = parentPath ? nodeMap.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(fileNode);
    } else {
      root.push(fileNode);
    }
  }

  for (const entry of entries.filter((e) => e.isDirectory)) {
    const slashIdx = entry.path.indexOf("/");
    const relativePath =
      slashIdx >= 0 ? entry.path.slice(slashIdx + 1) : entry.path;

    if (!relativePath || nodeMap.has(relativePath)) {
      continue;
    }

    const parts = relativePath.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]!}` : parts[i]!;
      if (nodeMap.has(currentPath)) {
        continue;
      }

      const dirNode: FileSystemTreeNode = {
        name: parts[i]!,
        path: currentPath,
        isDirectory: true,
        contentType: null,
        fileId: null,
        children: [],
      };
      nodeMap.set(currentPath, dirNode);

      const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/"));
      const parent = parentPath ? nodeMap.get(parentPath) : undefined;
      if (parent) {
        parent.children.push(dirNode);
      } else {
        root.push(dirNode);
      }
    }
  }

  return root;
}

/** Strip the scoped prefix (e.g. `project/`) from a mount path. */
export function getScopedRelativePath(scopedPath: string): string {
  const slashIdx = scopedPath.indexOf("/");
  return slashIdx >= 0 ? scopedPath.slice(slashIdx + 1) : scopedPath;
}

/** Parent folder path within the mount, or empty string for the root. */
export function getParentFolderRelativePath(relativeFilePath: string): string {
  const lastSlash = relativeFilePath.lastIndexOf("/");
  return lastSlash >= 0 ? relativeFilePath.slice(0, lastSlash) : "";
}

/** Join a parent folder path and file name within a mount (no scope prefix). */
export function joinMountRelativePath(
  parentRelativePath: string,
  fileName: string
): string {
  return parentRelativePath ? `${parentRelativePath}/${fileName}` : fileName;
}

function filterDirectoryNodes(
  nodes: FileSystemTreeNode[]
): FileSystemTreeNode[] {
  return nodes
    .filter((node) => node.isDirectory)
    .map((node) => ({
      ...node,
      children: filterDirectoryNodes(node.children),
    }));
}

/** Folder-only view of the sandbox tree (no files). */
export function buildFolderTree(
  entries: GCSMountEntry[]
): FileSystemTreeNode[] {
  return filterDirectoryNodes(buildSandboxTree(entries));
}

export function countFoldersInTree(nodes: FileSystemTreeNode[]): number {
  return nodes.reduce(
    (count, node) => count + 1 + countFoldersInTree(node.children),
    0
  );
}

/** Human-readable breadcrumb for a folder path in the move dialog. */
export function formatFolderDestinationLabel(
  folderPath: string,
  folderTree: FileSystemTreeNode[]
): string {
  if (!folderPath) {
    return ROOT_FOLDER_LABEL;
  }

  const labels = [ROOT_FOLDER_LABEL];
  let nodes = folderTree;
  let current = "";
  for (const part of folderPath.split("/")) {
    current = current ? `${current}/${part}` : part;
    const node = nodes.find((n) => n.path === current);
    if (!node) {
      labels.push(part);
      break;
    }
    labels.push(node.name);
    nodes = node.children;
  }
  return labels.join(" / ");
}

/** Paths of every ancestor folder, for expanding the tree to a location. */
export function getAncestorFolderPaths(folderPath: string): Set<string> {
  if (!folderPath) {
    return new Set();
  }

  const paths = new Set<string>();
  let current = "";
  for (const part of folderPath.split("/")) {
    current = current ? `${current}/${part}` : part;
    paths.add(current);
  }
  return paths;
}

/** Breadcrumb segments for a folder path (e.g. `reports/q1` → two segments). */
export function getFolderBreadcrumbSegments(
  folderPath: string
): { label: string; path: string }[] {
  if (!folderPath) {
    return [];
  }

  const segments: { label: string; path: string }[] = [];
  let current = "";
  for (const part of folderPath.split("/")) {
    current = current ? `${current}/${part}` : part;
    segments.push({ label: part, path: current });
  }
  return segments;
}

export function findTreeNodeByPath(
  nodes: FileSystemTreeNode[],
  path: string
): FileSystemTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }

    const found = findTreeNodeByPath(node.children, path);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** Children of a folder in the sandbox tree; root when `folderPath` is empty. */
export function getChildrenAtFolderPath(
  tree: FileSystemTreeNode[],
  folderPath: string
): FileSystemTreeNode[] {
  if (!folderPath) {
    return tree;
  }

  const folder = findTreeNodeByPath(tree, folderPath);
  return folder?.isDirectory ? folder.children : [];
}
