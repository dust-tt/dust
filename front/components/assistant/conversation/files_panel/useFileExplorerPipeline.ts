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
import { useMemo } from "react";

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

function toRelativePath(entry: GCSMountEntry): string {
  const slashIdx = entry.path.indexOf("/");
  return slashIdx >= 0 ? entry.path.slice(slashIdx + 1) : entry.path;
}

/**
 * Derives all explorer data from raw files + the current navigation/search/filter/sort state.
 * Each step is its own memo so unrelated state changes don't re-run downstream computations.
 */
export function useFileExplorerPipeline({
  files,
  folderStack,
  searchQuery,
  activeFilter,
  sortMode,
}: {
  files: GCSMountEntry[];
  folderStack: SandboxTreeNode[];
  searchQuery: string;
  activeFilter: FileExplorerFilter;
  sortMode: FileExplorerSortMode;
}): FileExplorerPipeline {
  const tree = useMemo(() => buildSandboxTree(files), [files]);

  // Two parallel maps keyed by tree-relative path: full entry (for rendering metadata) and
  // last-modified timestamp (for date sorts). Folders are inferred from paths by buildSandboxTree
  // so they don't appear here.
  const { entryByRelativePath, timestampsByPath } = useMemo(() => {
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
    return { entryByRelativePath, timestampsByPath };
  }, [files]);

  const currentNodes = useMemo(() => {
    if (folderStack.length === 0) {
      return tree;
    }

    return folderStack.at(-1)?.children ?? [];
  }, [tree, folderStack]);

  // Visible nodes at the current level: drop dotfiles (except sandbox outputs), then apply
  // search. Bucket counts are computed from this post-search list so chips update with search.
  const visibleNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return currentNodes.filter((node) => {
      if (node.name.startsWith(".") && node.name !== TOOL_OUTPUTS_FOLDER_NAME) {
        return false;
      }

      if (q.length > 0 && !node.name.toLowerCase().includes(q)) {
        return false;
      }

      return true;
    });
  }, [currentNodes, searchQuery]);

  const filterCounts = useMemo(() => {
    const counts: Partial<Record<FileExplorerFilter, number>> = {};

    for (const node of visibleNodes) {
      const bucket = getFileExplorerBucket(node);
      if (!bucket) {
        continue;
      }

      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    return counts;
  }, [visibleNodes]);

  return useMemo(() => {
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
  }, [
    visibleNodes,
    activeFilter,
    sortMode,
    timestampsByPath,
    entryByRelativePath,
    filterCounts,
  ]);
}
