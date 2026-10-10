import { Tree, SearchInput, ChevronRight } from "@dust-tt/sparkle";
import { useState, type ReactNode } from "react";
import type { FileScope, WorkspaceFile } from "./model";
import { isContainer } from "./model";
import { canonicalFile, type WorkspaceState } from "./engine";
import { fileIcons } from "./ResourceRow";
import { FileActions, type WorkspaceChange } from "./FileActions";

export function WorkspaceFilesBrowser({
  files,
  state,
  onChange,
  scope,
  referenceIds,
  onOpen,
  createAction = null,
  folderId,
  onFolderChange,
  destinationOnly = false,
}: {
  files: WorkspaceFile[];
  state?: WorkspaceState;
  onChange?: WorkspaceChange;
  scope?: FileScope;
  referenceIds?: string[];
  onOpen: (fileId: string) => void;
  createAction?: ReactNode;
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  destinationOnly?: boolean;
}) {
  const [localFolder, setLocalFolder] = useState<string | null>(
    folderId ?? null
  );
  const [query, setQuery] = useState("");
  const currentId = onFolderChange ? folderId : localFolder;
  const current = files.find((file) => file.id === currentId);
  const currentScope = current?.scope ?? scope ?? "My files";
  const navigate = (id: string | null) => {
    setLocalFolder(id);
    onFolderChange?.(id);
    setQuery("");
  };
  const byId = new Map(files.map((file) => [file.id, file]));
  const children = new Map<string, WorkspaceFile[]>();
  for (const file of files) {
    const key =
      file.parentId && byId.has(file.parentId) ? file.parentId : file.scope;
    children.set(key, [...(children.get(key) ?? []), file]);
  }
  const ancestors: WorkspaceFile[] = [];
  let ancestor = current;
  const visited = new Set<string>();
  while (ancestor && !visited.has(ancestor.id)) {
    visited.add(ancestor.id);
    ancestors.unshift(ancestor);
    if (
      referenceIds?.some((id) => canonicalFile(files, id)?.id === ancestor?.id)
    ) {
      break;
    }
    ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
  }
  const search = query.trim().toLowerCase();
  const matches = (file: WorkspaceFile, seen = new Set<string>()): boolean => {
    const target = canonicalFile(files, file.id) ?? file;
    if (seen.has(target.id)) {
      return false;
    }
    if (!search || target.name.toLowerCase().includes(search)) {
      return true;
    }
    return (children.get(target.id) ?? []).some((child) =>
      matches(child, new Set([...seen, target.id]))
    );
  };
  const roots = currentId
    ? (children.get(currentId) ?? [])
    : referenceIds
      ? referenceIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []))
      : (children.get(currentScope) ?? []);
  const renderItems = (
    items: WorkspaceFile[],
    seen = new Set<string>()
  ): ReactNode =>
    items
      .filter((file) => matches(file))
      .sort(
        (a, b) =>
          Number(isContainer(canonicalFile(files, b.id) ?? b)) -
            Number(isContainer(canonicalFile(files, a.id) ?? a)) ||
          a.name.localeCompare(b.name)
      )
      .map((file) => {
        const target = canonicalFile(files, file.id) ?? file;
        if (seen.has(target.id)) {
          return null;
        }
        const container = isContainer(target);
        const targetChildren = children.get(target.id) ?? [];
        const run = state?.runs.find(
          (run) =>
            run.conversationId === target.id ||
            run.outputIds.includes(target.id)
        );
        const editor =
          target.updatedBy ??
          (run
            ? files.find((file) => file.id === run.agentId)?.name
            : undefined) ??
          "Emma";
        const updated = target.updatedAt ?? run?.at ?? "2026-10-06T09:00:00Z";
        const type =
          file.kind === "link" ? `Link · ${target.kind}` : target.kind;

        return (
          <div key={file.id} data-workspace-file={file.id}>
            <Tree variant="navigator" overflowVisible>
              <Tree.Item
                label={`${target.name}${file.kind === "link" ? " ↗" : ""}`}
                visual={fileIcons[target.kind]}
                type={container ? "node" : "leaf"}
                defaultCollapsed={!search}
                onItemClick={() => {
                  if (
                    target.kind === "folder" ||
                    (destinationOnly && container)
                  ) {
                    navigate(target.id);
                  } else if (!destinationOnly) {
                    onOpen(target.id);
                  }
                }}
                areActionsFading={false}
                actions={
                  <div className="ml-auto grid w-[320px] shrink-0 grid-cols-[80px_100px_110px_30px] items-center text-xs text-muted-foreground">
                    <span className="truncate capitalize">{type}</span>
                    <span className="truncate" title={editor}>
                      {editor}
                    </span>
                    <time
                      dateTime={updated}
                      title={new Date(updated).toLocaleString()}
                    >
                      {new Date(updated).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                    {!destinationOnly && state && onChange ? (
                      <FileActions
                        file={target}
                        state={state}
                        onChange={onChange}
                        compact
                      />
                    ) : (
                      <span />
                    )}
                  </div>
                }
              >
                <div>
                  {targetChildren.length ? (
                    renderItems(targetChildren, new Set([...seen, target.id]))
                  ) : (
                    <Tree.Empty label="No files here yet" />
                  )}
                </div>
              </Tree.Item>
            </Tree>
          </div>
        );
      });
  return (
    <section aria-label="File browser" className="flex min-h-64 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-sm flex-1">
          <SearchInput
            name="explorer-search"
            placeholder="Search files…"
            value={query}
            onChange={setQuery}
          />
        </div>
        {createAction}
      </div>
      <nav
        aria-label="File location"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <button
          onClick={() => navigate(null)}
          className="rounded px-1 py-1 hover:bg-hover"
        >
          {referenceIds ? "Files" : (scope ?? currentScope)}
        </button>
        {ancestors.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button
              className="rounded px-1 py-1 hover:bg-hover"
              onClick={() => navigate(folder.id)}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </nav>
      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          {
            <div className="flex items-center border-b border-border py-3 pl-8 text-xs font-medium">
              <span className="flex-1">Name</span>
              <div className="mr-3 grid w-[320px] grid-cols-[80px_100px_110px_30px]">
                <span>Type</span>
                <span>Edited by</span>
                <span>Updated</span>
                <span className="sr-only">Actions</span>
              </div>
            </div>
          }
          <div className="min-h-48 py-2">
            <div key={`${currentId}:${scope}:${search}`}>
              {roots.some((file) => matches(file)) ? (
                renderItems(roots)
              ) : (
                <Tree.Empty
                  label={search ? "No matching files" : "No files here yet"}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
