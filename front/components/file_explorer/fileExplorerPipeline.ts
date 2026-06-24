import type {
  ContentNodeEntry,
  FileExplorerEntry,
  FileExplorerFilter,
  FileExplorerPathEntry,
  FileExplorerSortMode,
  FileSystemTreeNode,
} from "@app/components/file_explorer/types";
import {
  buildFileSystemTree,
  collectFileTreeNodesAtOrBelow,
  compareTreeNodesForSort,
  fileExplorerNodeMatchesSearch,
  getChildrenAtFolderPath,
  getExplorerRelativePath,
  getFileExplorerBucket,
  getVirtualScopeRootNodes,
  isFileExplorerNodeHidden,
} from "@app/components/file_explorer/utils";

export interface FileExplorerPipeline {
  /** Tree nodes at the current folder level, filtered + sorted. */
  sortedNodes: FileSystemTreeNode[];
  /** Count of items per filter bucket (post-search). Used by the chip row. */
  filterCounts: Partial<Record<FileExplorerFilter, number>>;
  folderCount: number;
  fileCount: number;
  /** Files at the current level in their rendering order (used by preview prev/next). */
  filesAtLevel: FileExplorerEntry[];
  /** Explorer-relative path → original entry. Used when rendering file cards. */
  entryByRelativePath: Map<string, FileExplorerEntry>;
}

interface GetFileExplorerPipelineParams {
  activeFilter: FileExplorerFilter;
  contentNodes: ContentNodeEntry[];
  currentFolderPath: string;
  files: FileExplorerPathEntry[];
  searchQuery: string;
  sortMode: FileExplorerSortMode;
  /** Top-level scope folders at the virtual root (e.g. `conversation`, `pod`). */
  virtualScopeRoots?: readonly string[];
}

function filterVisibleNodes(
  nodes: FileSystemTreeNode[],
  q: string
): FileSystemTreeNode[] {
  return nodes.filter((node) => {
    if (isFileExplorerNodeHidden(node)) {
      return false;
    }

    if (q.length > 0 && !fileExplorerNodeMatchesSearch(node, q)) {
      return false;
    }

    return true;
  });
}

/**
 * Derives all explorer data from raw files + the current navigation/search/filter/sort state.
 * Pure function — callers should wrap it in `useMemo` keyed on the inputs.
 */
export function getFileExplorerPipeline({
  activeFilter,
  contentNodes,
  currentFolderPath,
  files,
  searchQuery,
  sortMode,
  virtualScopeRoots,
}: GetFileExplorerPipelineParams): FileExplorerPipeline {
  const entryByRelativePath = new Map<string, FileExplorerEntry>();
  for (const f of files) {
    if (f.isDirectory) {
      continue;
    }

    const relativePath = getExplorerRelativePath(f);
    entryByRelativePath.set(relativePath, { ...f, kind: "file" });
  }

  // Content nodes are always flat (no folder structure). They appear only at
  // the root level and are keyed by their synthetic path.
  for (const node of contentNodes) {
    entryByRelativePath.set(node.path, node);
  }

  const tree = buildFileSystemTree(files);

  // Synthetic tree nodes for content-node entries — always flat, at root level.
  const contentNodeTreeNodes: FileSystemTreeNode[] = contentNodes.map((cn) => ({
    name: cn.fileName,
    path: cn.path,
    isDirectory: false,
    contentType: null,
    fileId: null,
    children: [],
  }));

  const q = searchQuery.trim().toLowerCase();
  const isSearching = q.length > 0;
  const currentNodes = isSearching
    ? [
        ...collectFileTreeNodesAtOrBelow(tree, currentFolderPath),
        ...(currentFolderPath ? [] : contentNodeTreeNodes),
      ]
    : currentFolderPath
      ? getChildrenAtFolderPath(tree, currentFolderPath)
      : virtualScopeRoots
        ? getVirtualScopeRootNodes(tree, virtualScopeRoots)
        : [...tree, ...contentNodeTreeNodes];

  const visibleNodes = filterVisibleNodes(currentNodes, q);

  const filterCounts: Partial<Record<FileExplorerFilter, number>> = {};
  for (const node of visibleNodes) {
    const entry = entryByRelativePath.get(node.path);
    if (entry?.kind === "node") {
      filterCounts["nodes"] = (filterCounts["nodes"] ?? 0) + 1;
      continue;
    }
    const bucket = getFileExplorerBucket(node);
    if (!bucket) {
      continue;
    }
    filterCounts[bucket] = (filterCounts[bucket] ?? 0) + 1;
  }

  const matchingNodes =
    activeFilter === "all"
      ? visibleNodes
      : visibleNodes.filter((n) => {
          if (activeFilter === "nodes") {
            return entryByRelativePath.get(n.path)?.kind === "node";
          }
          return getFileExplorerBucket(n) === activeFilter;
        });

  const sortedNodes = [...matchingNodes].sort((a, b) =>
    compareTreeNodesForSort(a, b, sortMode, entryByRelativePath)
  );

  let folderCount = 0;
  const filesAtLevel: FileExplorerEntry[] = [];
  for (const node of sortedNodes) {
    if (node.isDirectory) {
      folderCount += 1;
    } else {
      const entry = entryByRelativePath.get(node.path);
      if (entry) {
        filesAtLevel.push(entry);
      }
    }
  }

  return {
    sortedNodes,
    filterCounts,
    folderCount,
    fileCount: filesAtLevel.length,
    filesAtLevel,
    entryByRelativePath,
  };
}
