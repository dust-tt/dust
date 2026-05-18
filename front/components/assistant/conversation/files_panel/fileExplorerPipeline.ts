import type {
  FileExplorerFilter,
  FileExplorerSortMode,
  SandboxTreeNode,
} from "@app/components/assistant/conversation/files_panel/types";
import {
  buildSandboxTree,
  compareTreeNodesForSort,
  getFileExplorerBucket,
} from "@app/components/assistant/conversation/files_panel/utils";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import type {
  GCSMountEntry,
  GCSMountFileEntry,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";

export interface FileExplorerPipeline {
  /** Tree nodes at the current folder level, filtered + sorted. */
  sortedNodes: SandboxTreeNode[];
  /** Count of items per filter bucket (post-search). Used by the chip row. */
  filterCounts: Partial<Record<FileExplorerFilter, number>>;
  folderCount: number;
  fileCount: number;
  /** Files at the current level in their rendering order (used by preview prev/next). */
  filesAtLevel: GCSMountFileEntry[];
  /** Tree-relative path → original entry. Used when rendering file cards. */
  entryByRelativePath: Map<string, GCSMountFileEntry>;
}

interface GetFileExplorerPipelineParams {
  activeFilter: FileExplorerFilter;
  files: GCSMountEntry[];
  folderStack: SandboxTreeNode[];
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
  files,
  folderStack,
  searchQuery,
  sortMode,
}: GetFileExplorerPipelineParams): FileExplorerPipeline {
  const entryByRelativePath = new Map<string, GCSMountFileEntry>();
  const timestampsByPath = new Map<string, number>();
  for (const f of files) {
    if (f.isDirectory) {
      continue;
    }

    const relativePath = toRelativePath(f);
    entryByRelativePath.set(relativePath, f);
    timestampsByPath.set(relativePath, f.lastModifiedMs);
  }

  const tree = buildSandboxTree(files);
  const currentNodes =
    folderStack.length === 0 ? tree : (folderStack.at(-1)?.children ?? []);

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
    const bucket = getFileExplorerBucket(node);
    if (!bucket) {
      continue;
    }

    filterCounts[bucket] = (filterCounts[bucket] ?? 0) + 1;
  }

  const matchingNodes =
    activeFilter === "all"
      ? visibleNodes
      : visibleNodes.filter((n) => getFileExplorerBucket(n) === activeFilter);

  const sortedNodes = [...matchingNodes].sort((a, b) =>
    compareTreeNodesForSort(a, b, sortMode, timestampsByPath)
  );

  let folderCount = 0;
  const filesAtLevel: GCSMountFileEntry[] = [];
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
