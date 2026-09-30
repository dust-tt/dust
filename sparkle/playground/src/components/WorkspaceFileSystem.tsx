import {
  Button,
  Cube01,
  Folder,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Tree,
} from "@dust-tt/sparkle";
import {
  type ComponentType,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getCompanySpaceIcon } from "../data/companySpaces";
import {
  getDataSourceChildren,
  getDataSourcesBySpaceId,
  getFolderPath,
  isDataSourceFolder,
  sortDataSourcesForDisplay,
} from "../data/dataSources";
import type { DataSource, Space } from "../data/types";
import { FilesBrowser } from "./FilesBrowser";

// Workspace-wide file system: every Company Space and Pod becomes a root
// folder of one tree, so the same FilesBrowser (breadcrumbs, folder
// navigation, search) browses the whole workspace. The tree and the view are
// two halves of a single panel sharing the current folder.

/** Below this width the tree folds into a dropdown above the view. */
const COMPACT_BELOW = 720;

type IconComponent = ComponentType<{ className?: string }>;

interface WorkspaceFileSystemProps {
  pods: Space[];
  companySpaces: Space[];
  onFileOpen: (dataSource: DataSource) => void;
}

function spaceRootId(space: Space) {
  return `space-root-${space.id}`;
}

function buildWorkspaceItems(
  companySpaces: Space[],
  pods: Space[]
): { items: DataSource[]; rootIcons: Map<string, IconComponent> } {
  const items: DataSource[] = [];
  const rootIcons = new Map<string, IconComponent>();
  const addSpace = (
    space: Space,
    source: DataSource["source"],
    icon: IconComponent
  ) => {
    const rootId = spaceRootId(space);
    rootIcons.set(rootId, icon);
    const children = getDataSourcesBySpaceId(space.id);
    const latest = children.reduce<Date | null>(
      (acc, item) => (!acc || item.updatedAt > acc ? item.updatedAt : acc),
      null
    );
    items.push({
      id: rootId,
      kind: "folder",
      fileName: space.name,
      parentId: null,
      source,
      createdBy: children[0]?.createdBy ?? "",
      createdAt: latest ?? new Date(),
      updatedAt: latest ?? new Date(),
      icon,
    });
    for (const item of children) {
      items.push({
        ...item,
        source,
        parentId: item.parentId ?? rootId,
      });
    }
  };

  companySpaces.forEach((space) =>
    addSpace(space, "company", getCompanySpaceIcon(space))
  );
  pods.forEach((space) => addSpace(space, "pod", Cube01));
  return { items, rootIcons };
}

export function WorkspaceFileSystem({
  pods,
  companySpaces,
  onFileOpen,
}: WorkspaceFileSystemProps) {
  const { items, rootIcons } = useMemo(
    () => buildWorkspaceItems(companySpaces, pods),
    [companySpaces, pods]
  );

  const [currentFolderId, setCurrentFolderIdState] = useState<string | null>(
    null
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isTreeMenuOpen, setIsTreeMenuOpen] = useState(false);

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

  /** Opening a folder from anywhere (tree, table, breadcrumbs) reveals it in the tree. */
  const setCurrentFolderId = (folderId: string | null) => {
    setCurrentFolderIdState(folderId);
    if (!folderId) {
      return;
    }
    const ancestors = getFolderPath(items, folderId)
      .slice(0, -1)
      .map((folder) => folder.id);
    if (ancestors.length > 0) {
      setExpandedIds((prev) => new Set([...prev, ...ancestors]));
    }
  };

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
    setCurrentFolderId(folderId);
    setIsTreeMenuOpen(false);
  };

  const getSubfolders = (parentId: string) =>
    sortDataSourcesForDisplay(
      getDataSourceChildren(items, parentId).filter(isDataSourceFolder)
    );
  // Space roots keep their Company Spaces-then-Pods order.
  const spaceRoots = getDataSourceChildren(items, null);

  const renderFolder = (folder: DataSource) => {
    const subfolders = getSubfolders(folder.id);
    return (
      <Tree.Item
        key={folder.id}
        label={folder.fileName}
        visual={rootIcons.get(folder.id) ?? Folder}
        type={subfolders.length > 0 ? "node" : "leaf"}
        collapsed={!expandedIds.has(folder.id)}
        onChevronClick={() => toggleExpanded(folder.id)}
        isSelected={currentFolderId === folder.id}
        onItemClick={() => selectFolder(folder.id)}
      >
        {subfolders.length > 0 && (
          <Tree variant="navigator">{subfolders.map(renderFolder)}</Tree>
        )}
      </Tree.Item>
    );
  };

  const tree = (
    <Tree variant="navigator">
      <Tree.Item
        label="Files"
        type="item"
        visual={Folder}
        isSelected={currentFolderId === null}
        onItemClick={() => selectFolder(null)}
      />
      {spaceRoots.map(renderFolder)}
    </Tree>
  );

  const currentFolder = currentFolderId
    ? items.find((item) => item.id === currentFolderId)
    : undefined;
  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      {!isCompact && (
        <aside className="flex w-64 flex-none flex-col overflow-y-auto border-r border-separator p-2">
          {tree}
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {isCompact && (
          <PopoverRoot open={isTreeMenuOpen} onOpenChange={setIsTreeMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                isSelect
                className="self-start"
                icon={
                  (currentFolderId && rootIcons.get(currentFolderId)) || Folder
                }
                label={currentFolder?.fileName ?? "Files"}
              />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-[60vh] w-72 overflow-y-auto p-2"
            >
              {tree}
            </PopoverContent>
          </PopoverRoot>
        )}
        <FilesBrowser
          dataSources={items}
          currentFolderId={currentFolderId}
          onCurrentFolderIdChange={setCurrentFolderId}
          onFileOpen={onFileOpen}
          onDeleteFile={() => {}}
          emptyMessage="No files in this workspace yet."
        />
      </div>
    </div>
  );
}
