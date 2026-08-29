import type {
  ContentNodeEntry,
  FileExplorerEntry,
  FileExplorerFilter,
  FileExplorerPathEntry,
  FileExplorerSortMode,
  FileSystemTreeNode,
  FramePackageEntry,
} from "@app/components/file_explorer/types";
import {
  buildFileSystemTree,
  collectFileTreeNodesAtOrBelow,
  compareTreeNodesForSort,
  fileExplorerNodeMatchesSearch,
  getChildrenAtFolderPath,
  getExplorerRelativePath,
  getFileExplorerBucket,
  getParentFolderRelativePath,
  getVirtualScopeRootNodes,
  isFileExplorerNodeHidden,
} from "@app/components/file_explorer/utils";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";

interface FileExplorerPipeline {
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
  /** Collapse registered Frames v2 source folders into package entries. */
  displayFramePackages?: boolean;
  /** Top-level scope folders at the virtual root (e.g. `conversation`, `pod`). */
  virtualScopeRoots?: readonly string[];
}

function isPathAtOrBelow(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

function getCollapsedFramePackages({
  currentFolderPath,
  files,
}: {
  currentFolderPath: string;
  files: FileExplorerPathEntry[];
}): FramePackageEntry[] {
  const candidates = new Map<string, FramePackageEntry>();

  for (const file of files) {
    if (
      file.isDirectory ||
      file.fileResourceContentType !== frameV2ContentType ||
      file.fileName !== FRAME_MANIFEST_FILE ||
      !file.fileId
    ) {
      continue;
    }

    const manifestExplorerPath = getExplorerRelativePath(file);
    const sourceFolderPath = getParentFolderRelativePath(manifestExplorerPath);
    if (
      !sourceFolderPath ||
      isPathAtOrBelow(currentFolderPath, sourceFolderPath)
    ) {
      continue;
    }

    candidates.set(sourceFolderPath, {
      ...file,
      kind: "frame_package",
      contentType: frameV2ContentType,
      fileId: file.fileId,
      fileName: sourceFolderPath.slice(sourceFolderPath.lastIndexOf("/") + 1),
      sourceFolderPath,
      virtualPath: sourceFolderPath,
    });
  }

  // If packages are nested, only the outer package is visible until its source is opened.
  const packages: FramePackageEntry[] = [];
  const packagePaths = new Set(candidates.keys());
  for (const [sourceFolderPath, framePackage] of candidates) {
    let ancestorPath = getParentFolderRelativePath(sourceFolderPath);
    let hasPackageAncestor = false;
    while (ancestorPath) {
      if (packagePaths.has(ancestorPath)) {
        hasPackageAncestor = true;
        break;
      }
      ancestorPath = getParentFolderRelativePath(ancestorPath);
    }
    if (!hasPackageAncestor) {
      packages.push(framePackage);
    }
  }

  return packages;
}

function collapseFramePackages({
  currentFolderPath,
  displayFramePackages,
  files,
}: {
  currentFolderPath: string;
  displayFramePackages: boolean;
  files: FileExplorerPathEntry[];
}): {
  files: FileExplorerPathEntry[];
  packagesByPath: Map<string, FramePackageEntry>;
} {
  if (!displayFramePackages) {
    return { files, packagesByPath: new Map() };
  }

  const packages = getCollapsedFramePackages({ currentFolderPath, files });
  if (packages.length === 0) {
    return { files, packagesByPath: new Map() };
  }

  const packagesByPath = new Map(
    packages.map((framePackage) => [
      framePackage.sourceFolderPath,
      framePackage,
    ])
  );
  const visibleFiles = files.filter((file) => {
    let candidatePath = getExplorerRelativePath(file);
    while (candidatePath) {
      if (packagesByPath.has(candidatePath)) {
        return false;
      }
      candidatePath = getParentFolderRelativePath(candidatePath);
    }
    return true;
  });

  return {
    files: [...visibleFiles, ...packages],
    packagesByPath,
  };
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
  displayFramePackages = false,
  files,
  searchQuery,
  sortMode,
  virtualScopeRoots,
}: GetFileExplorerPipelineParams): FileExplorerPipeline {
  const collapsed = collapseFramePackages({
    currentFolderPath,
    displayFramePackages,
    files,
  });
  const entryByRelativePath = new Map<string, FileExplorerEntry>();
  for (const f of collapsed.files) {
    if (f.isDirectory) {
      continue;
    }

    const relativePath = getExplorerRelativePath(f);
    const framePackage = collapsed.packagesByPath.get(relativePath);
    entryByRelativePath.set(
      relativePath,
      framePackage ?? { ...f, kind: "file" }
    );
  }

  // Content nodes are always flat (no folder structure). They appear only at
  // the root level and are keyed by their synthetic path.
  for (const node of contentNodes) {
    entryByRelativePath.set(node.path, node);
  }

  const tree = buildFileSystemTree(collapsed.files);

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
