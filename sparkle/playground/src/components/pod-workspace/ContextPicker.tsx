import {
  Button,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tree,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { isContainer, type FileScope, type WorkspaceFile } from "./model";

import { fileIcons } from "./ResourceRow";

const scopes: FileScope[] = ["My files", "Workspace files", "Shared with me"];

export function ContextPicker({
  files,
  linkedIds,
  onAdd,
  onClose,
  onOpen,
  destination = "pod",
}: {
  files: WorkspaceFile[];
  linkedIds: Set<string>;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
  destination?: "pod" | "conversation";
}) {
  const [scope, setScope] = useState<FileScope>("My files");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string>();
  const available = files.filter(
    (file) =>
      file.kind !== "link" &&
      !file.id.startsWith("pod:") &&
      file.id !== "pods" &&
      file.scope === scope
  );
  const byId = new Map(available.map((file) => [file.id, file]));
  const search = query.trim().toLowerCase();
  const visibleIds = new Set<string>();
  for (const file of available) {
    if (
      !search ||
      `${file.name} ${file.description}`.toLowerCase().includes(search)
    ) {
      let current: WorkspaceFile | undefined = file;
      while (current && !visibleIds.has(current.id)) {
        visibleIds.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
  }
  const children = new Map<string, WorkspaceFile[]>();
  for (const file of available.filter((file) => visibleIds.has(file.id))) {
    const parent =
      file.parentId && byId.has(file.parentId) ? file.parentId : scope;
    children.set(parent, [...(children.get(parent) ?? []), file]);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (a, b) =>
        Number(isContainer(b)) - Number(isContainer(a)) ||
        a.name.localeCompare(b.name)
    );
  }
  const toggle = (id: string) => {
    if (!linkedIds.has(id)) {
      setSelected((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
      );
    }
  };

  const renderItems = (parent: string): React.ReactNode =>
    (children.get(parent) ?? []).map((file) => (
      <Tree.Item
        key={file.id}
        label={file.name}
        visual={fileIcons[file.kind]}
        type={isContainer(file) ? "node" : "leaf"}
        defaultCollapsed={!search}
        isSelected={previewId === file.id}
        checkbox={{
          checked: linkedIds.has(file.id) || selected.includes(file.id),
          disabled: linkedIds.has(file.id),
          onCheckedChange: () => toggle(file.id),
        }}
        onItemClick={() => {
          setPreviewId(file.id);
          onOpen(file.id);
        }}
      >
        <Tree variant="navigator">
          {children.has(file.id) ? (
            renderItems(file.id)
          ) : (
            <Tree.Empty label="This folder is empty" />
          )}
        </Tree>
      </Tree.Item>
    ));

  return (
    <section
      aria-label="Add files"
      className="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground"
    >
      <div className="shrink-0 px-5 pb-4 pt-5">
        <p className="mb-4 text-sm text-muted-foreground">
          Select files or folders to add. Click a name to preview.
        </p>
        <label htmlFor="context-search" className="sr-only">
          Search files
        </label>
        <SearchInput
          id="context-search"
          name="context-search"
          placeholder={`Search ${scope}…`}
          value={query}
          onChange={setQuery}
        />
      </div>
      <Tabs
        className="flex min-h-0 flex-1 flex-col px-5"
        value={scope.replace(/ /g, "-")}
        onValueChange={(value) => {
          const nextScope = scopes.find(
            (name) => name.replace(/ /g, "-") === value
          );
          if (nextScope) {
            setScope(nextScope);
            setQuery("");
          }
        }}
      >
        <TabsList>
          {scopes.map((name) => (
            <TabsTrigger
              key={name}
              value={name.replace(/ /g, "-")}
              label={name}
            />
          ))}
        </TabsList>
        <TabsContent
          value={scope.replace(/ /g, "-")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            aria-label="Files and folders"
            className="min-h-0 flex-1 overflow-y-auto py-3"
          >
            <Tree key={`${scope}:${search}`} variant="navigator">
              {children.has(scope) ? (
                renderItems(scope)
              ) : (
                <Tree.Empty
                  label={search ? "No matching files" : "No files here yet"}
                />
              )}
            </Tree>
          </div>
        </TabsContent>
      </Tabs>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        <div className="flex items-center gap-2">
          <span role="status" className="text-sm text-muted-foreground">
            {selected.length} selected
          </span>
          {selected.length > 0 && (
            <Button
              label="Clear"
              variant="ghost"
              size="xs"
              onClick={() => setSelected([])}
            />
          )}
        </div>
        <div className="flex gap-2">
          <Button label="Cancel" variant="outline" onClick={onClose} />
          <Button
            label={
              selected.length
                ? `Add ${selected.length} to ${destination}`
                : `Add to ${destination}`
            }
            variant="highlight"
            disabled={selected.length === 0}
            onClick={() => onAdd(selected)}
          />
        </div>
      </div>
    </section>
  );
}
