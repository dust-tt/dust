import type {
  ContentNodeEntry,
  FileExplorerEntry,
  FileExplorerFilter,
  FileExplorerSortMode,
  FileSystemTreeNode,
} from "@app/components/file_explorer/types";
import {
  buildFileSystemTree,
  compareTreeNodesForSort,
  getChildrenAtFolderPath,
  getFileExplorerBucket,
} from "@app/components/file_explorer/utils";
import type { GCSMountEntry } from "@app/lib/api/files/gcs_mount/files";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";

export interface FileExplorerPipeline {
  /** Tree nodes at the current folder level, filtered + sorted. */
  sortedNodes: FileSystemTreeNode[];
  /** Count of items per filter bucket (post-search). Used by the chip row. */
  filterCounts: Partial<Record<FileExplorerFilter, number>>;
  folderCount: number;
  fileCount: number;
  /** Files at the current level in their rendering order (used by preview prev/next). */
  filesAtLevel: FileExplorerEntry[];
  /** Tree-relative path → original entry. Used when rendering file cards. */
  entryByRelativePath: Map<string, FileExplorerEntry>;
}

interface GetFileExplorerPipelineParams {
  activeFilter: FileExplorerFilter;
  contentNodes: ContentNodeEntry[];
  currentFolderPath: string;
  files: GCSMountEntry[];
  searchQuery: string;
  sortMode: FileExplorerSortMode;
}

function toRelativePath(entry: GCSMountEntry): string {
  const slashIdx = entry.path.indexOf("/");
  return slashIdx >= 0 ? entry.path.slice(slashIdx + 1) : entry.path;
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
}: GetFileExplorerPipelineParams): FileExplorerPipeline {
  const entryByRelativePath = new Map<string, FileExplorerEntry>();
  for (const f of files) {
    if (f.isDirectory) {
      continue;
    }

    const relativePath = toRelativePath(f);
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

  const currentNodes = currentFolderPath
    ? getChildrenAtFolderPath(tree, currentFolderPath)
    : [...tree, ...contentNodeTreeNodes];

  const q = searchQuery.trim().toLowerCase();
  const visibleNodes = currentNodes.filter((node) => {
    if (node.name.startsWith(".") && node.name !== TOOL_OUTPUTS_FOLDER_NAME) {
      return false;
    }

    if (q.length > 0 && !node.name.toLowerCase().includes(q)) {
      return false;
    }

    return true;
  });

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
