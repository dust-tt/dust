import {
  Breadcrumbs,
  type BreadcrumbsItem,
  Button,
  Checkbox,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  InfoCircle,
  Input,
  Label,
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  Popover,
  SearchInput,
  SliderToggle,
  SpaceClosed,
  TextArea,
  Tree,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "./dialogs";
import {
  type BuilderSpace,
  getBuilderSpaceById,
  getKnowledgeChildren,
  getKnowledgeLocation,
  getKnowledgeNodeById,
  KNOWLEDGE_METHODS,
  KNOWLEDGE_PAGE_TITLES,
  type KnowledgeMethodId,
  type KnowledgeNode,
  mockBuilderSpaces,
  searchKnowledge,
} from "./data";

export type KnowledgeConfiguration = {
  key: string;
  method: KnowledgeMethodId;
  name: string;
  description: string;
  nodeIds: string[];
  timeFrame: { enabled: boolean; value: number; unit: string };
  jsonSchema: string;
  filters: {
    mustHaveLabels: string;
    mustNotHaveLabels: string;
    inConversationFiltering: boolean;
  };
};

export function emptyKnowledgeConfiguration(): KnowledgeConfiguration {
  return {
    key: `knowledge-${Date.now()}`,
    method: "search",
    name: "",
    description: "",
    nodeIds: [],
    timeFrame: { enabled: false, value: 7, unit: "day" },
    jsonSchema: "",
    filters: {
      mustHaveLabels: "",
      mustNotHaveLabels: "",
      inConversationFiltering: false,
    },
  };
}

type Location = { spaceId: string; nodeId: string | null };

function SelectionPage({
  selectedSpaceIds,
  selectedNodeIds,
  onToggleNode,
  onSetNodes,
}: {
  selectedSpaceIds: string[];
  selectedNodeIds: string[];
  onToggleNode: (id: string) => void;
  onSetNodes: (ids: string[]) => void;
}) {
  const [location, setLocation] = useState<Location | null>(null);
  const [search, setSearch] = useState("");
  const [searchScope, setSearchScope] = useState<"node" | "space">("space");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = window.setTimeout(() => setIsSearching(false), 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  const spaces = selectedSpaceIds
    .map((id) => getBuilderSpaceById(id))
    .filter((space): space is BuilderSpace => Boolean(space));
  const fromSpaces = spaces.filter((space) => space.kind === "space");
  const fromPods = spaces.filter((space) => space.kind === "pod");

  if (spaces.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <span className="heading-base text-foreground">
          No data sources available
        </span>
        <span className="text-sm text-muted-foreground">
          Connect data sources or ask your admin to set them up
        </span>
        <Button size="sm" variant="outline" label="Connect data" />
      </div>
    );
  }

  if (!location) {
    const renderSpace = (space: BuilderSpace) => (
      <button
        key={space.id}
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left hover:bg-muted-background"
        onClick={() => setLocation({ spaceId: space.id, nodeId: null })}
      >
        <Icon visual={SpaceClosed} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">
            {space.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {space.description}
          </span>
        </div>
      </button>
    );
    return (
      <div className="flex flex-col gap-5">
        <Breadcrumbs items={[{ label: "All" }]} />
        {fromSpaces.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="heading-xs uppercase text-muted-foreground">
              From spaces:
            </span>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {fromSpaces.map(renderSpace)}
            </div>
          </div>
        ) : null}
        {fromPods.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="heading-xs uppercase text-muted-foreground">
              From Pods:
            </span>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {fromPods.map(renderSpace)}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const space = getBuilderSpaceById(location.spaceId)!;
  const currentNode = location.nodeId
    ? getKnowledgeNodeById(location.nodeId)
    : undefined;
  const needle = search.trim();
  const rows: KnowledgeNode[] = needle
    ? searchKnowledge(space.id, needle).filter((node) =>
        searchScope === "space" || !currentNode
          ? true
          : getKnowledgeLocation(node).includes(currentNode.title)
      )
    : getKnowledgeChildren(location.nodeId, space.id);
  const allChecked =
    rows.length > 0 && rows.every((row) => selectedNodeIds.includes(row.id));
  const someChecked = rows.some((row) => selectedNodeIds.includes(row.id));

  const trail: { label: string; onClick?: () => void }[] = [
    { label: "All", onClick: () => setLocation(null) },
    {
      label: space.name,
      onClick: () => setLocation({ spaceId: space.id, nodeId: null }),
    },
  ];
  let ancestor = currentNode;
  const ancestors: KnowledgeNode[] = [];
  while (ancestor) {
    ancestors.unshift(ancestor);
    ancestor = ancestor.parentId
      ? getKnowledgeNodeById(ancestor.parentId)
      : undefined;
  }
  ancestors.forEach((node, index) => {
    const isLast = index === ancestors.length - 1;
    trail.push({
      label: node.title,
      onClick: isLast
        ? undefined
        : () => setLocation({ spaceId: space.id, nodeId: node.id }),
    });
  });

  const breadcrumbItems: BreadcrumbsItem[] = trail.map(
    (item): BreadcrumbsItem =>
      item.onClick
        ? { label: item.label, onClick: item.onClick }
        : { label: item.label }
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={breadcrumbItems} />
      <SearchInput
        name="knowledge-search"
        placeholder={`Search in ${space.name}`}
        value={search}
        onChange={setSearch}
        isLoading={isSearching}
      />
      {needle && currentNode ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Searching in:
          <Button
            size="xs"
            variant={searchScope === "node" ? "primary" : "outline"}
            label={currentNode.title}
            onClick={() => setSearchScope("node")}
          />
          <span>|</span>
          <Button
            size="xs"
            variant={searchScope === "space" ? "primary" : "outline"}
            label={`All ${space.name}`}
            onClick={() => setSearchScope("space")}
          />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          {needle ? (
            <>
              <span className="heading-base text-foreground">
                0 results found
              </span>
              <span className="text-sm text-muted-foreground">
                No matching results found. Try different search terms.
              </span>
            </>
          ) : (
            <>
              <span className="heading-base text-foreground">
                No pages found
              </span>
              <span className="text-sm text-muted-foreground">
                This website doesn't have any pages to browse yet.
              </span>
              <Button
                size="sm"
                variant="outline"
                label="Go back"
                onClick={() =>
                  setLocation(
                    currentNode?.parentId
                      ? { spaceId: space.id, nodeId: currentNode.parentId }
                      : { spaceId: space.id, nodeId: null }
                  )
                }
              />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col rounded-xl border border-border">
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <Checkbox
              checked={allChecked ? true : someChecked ? "partial" : false}
              onCheckedChange={() => {
                if (allChecked) {
                  onSetNodes(
                    selectedNodeIds.filter(
                      (id) => !rows.some((row) => row.id === id)
                    )
                  );
                } else {
                  onSetNodes(
                    Array.from(
                      new Set([
                        ...selectedNodeIds,
                        ...rows.map((row) => row.id),
                      ])
                    )
                  );
                }
              }}
            />
            <span className="heading-xs flex-1 text-muted-foreground">
              Name
            </span>
            {needle ? (
              <span className="heading-xs w-48 text-muted-foreground">
                Location
              </span>
            ) : null}
          </div>
          {rows.map((row) => {
            const isChecked = selectedNodeIds.includes(row.id);
            const canOpen = row.kind === "connection" || row.kind === "folder";
            return (
              <div
                key={row.id}
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted-background"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => onToggleNode(row.id)}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={
                    canOpen
                      ? () => {
                          setSearch("");
                          setLocation({ spaceId: space.id, nodeId: row.id });
                        }
                      : () => onToggleNode(row.id)
                  }
                >
                  <Icon visual={row.icon} size="sm" />
                  <span className="truncate text-sm text-foreground">
                    {row.title}
                  </span>
                </button>
                {needle ? (
                  <span className="w-48 truncate text-xs text-muted-foreground">
                    {getKnowledgeLocation(row) || space.name}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelectionFooter({
  selectedNodeIds,
  onRemove,
}: {
  selectedNodeIds: string[];
  onRemove: (id: string) => void;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger
        label={`Selection (${selectedNodeIds.length} items)`}
      />
      <CollapsibleContent>
        {selectedNodeIds.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">No selection</div>
        ) : (
          <ContextItem.List>
            {selectedNodeIds.map((id) => {
              const node = getKnowledgeNodeById(id);
              if (!node) {
                return null;
              }
              return (
                <ContextItem
                  key={id}
                  title={node.title}
                  visual={<ContextItem.Visual visual={node.icon} />}
                  subElement={getKnowledgeLocation(node)}
                  action={
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={XClose}
                      onClick={() => onRemove(id)}
                    />
                  }
                />
              );
            })}
          </ContextItem.List>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConfigurePage({
  configuration,
  onChange,
  onManageSelection,
}: {
  configuration: KnowledgeConfiguration;
  onChange: (next: KnowledgeConfiguration) => void;
  onManageSelection: () => void;
}) {
  const method = KNOWLEDGE_METHODS.find(
    (candidate) => candidate.id === configuration.method
  )!;
  const nodes = configuration.nodeIds
    .map((id) => getKnowledgeNodeById(id))
    .filter((node): node is KnowledgeNode => Boolean(node));
  const tables = nodes.filter((node) => node.kind === "table");
  const documents = nodes.filter((node) => node.kind !== "table");
  const wantsTables = configuration.method === "tables";
  const ignoredWarning =
    wantsTables && documents.length > 0
      ? "Documents in your selection will be ignored: this method only queries tables."
      : !wantsTables && tables.length > 0
        ? "Tables in your selection will be ignored: this method only reads documents."
        : null;
  const isEmptySelection = wantsTables
    ? tables.length === 0
    : documents.length === 0;

  const bySpace = useMemo(() => {
    const groups = new Map<string, KnowledgeNode[]>();
    nodes.forEach((node) => {
      const list = groups.get(node.spaceId) ?? [];
      list.push(node);
      groups.set(node.spaceId, list);
    });
    return groups;
  }, [nodes]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">
          Knowledge lookup method
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="primary" isSelect label={method.label} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {KNOWLEDGE_METHODS.map((candidate) => (
              <DropdownMenuItem
                key={candidate.id}
                label={candidate.label}
                onSelect={() =>
                  onChange({ ...configuration, method: candidate.id })
                }
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {ignoredWarning ? (
          <ContentMessage variant="warning" size="sm" icon={InfoCircle}>
            {ignoredWarning}
          </ContentMessage>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Name</Label>
        <Input
          placeholder="Name ..."
          value={configuration.name}
          onChange={(event) =>
            onChange({ ...configuration, name: event.target.value })
          }
        />
      </div>

      {configuration.method === "include" ||
      configuration.method === "extract" ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">
            Time range configuration
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              checked={configuration.timeFrame.enabled}
              onCheckedChange={(checked) =>
                onChange({
                  ...configuration,
                  timeFrame: {
                    ...configuration.timeFrame,
                    enabled: checked === true,
                  },
                })
              }
            />
            <span className="text-sm text-foreground">
              Search data from the last
            </span>
            <Input
              type="number"
              containerClassName="w-20"
              disabled={!configuration.timeFrame.enabled}
              value={String(configuration.timeFrame.value)}
              onChange={(event) =>
                onChange({
                  ...configuration,
                  timeFrame: {
                    ...configuration.timeFrame,
                    value: Number(event.target.value) || 1,
                  },
                })
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  isSelect
                  className="self-start"
                  disabled={!configuration.timeFrame.enabled}
                  label={`${configuration.timeFrame.unit}s`}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {["hour", "day", "week", "month", "year"].map((unit) => (
                  <DropdownMenuItem
                    key={unit}
                    label={`${unit}s`}
                    onSelect={() =>
                      onChange({
                        ...configuration,
                        timeFrame: { ...configuration.timeFrame, unit },
                      })
                    }
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}

      {configuration.method === "extract" ? (
        <div className="flex flex-col gap-2">
          <Label className="text-base font-semibold">Schema</Label>
          <TextArea
            value={configuration.jsonSchema}
            onChange={(event) =>
              onChange({ ...configuration, jsonSchema: event.target.value })
            }
            placeholder='{ "type": "object", "properties": { ... } }'
            minRows={5}
            resize="vertical"
            className="font-mono text-xs"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">
          {wantsTables ? "Query description" : "What’s the data?"}
        </Label>
        <TextArea
          value={configuration.description}
          onChange={(event) =>
            onChange({ ...configuration, description: event.target.value })
          }
          placeholder="This data contains…"
          minRows={3}
          resize="vertical"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">
            {wantsTables
              ? "Selected data source(s)"
              : "Selected data source(s)"}
          </Label>
          <div className="flex items-center gap-2">
            <Popover
              trigger={<Button size="xs" variant="outline" label="Filters" />}
              content={
                <div className="flex w-72 flex-col gap-3 text-sm">
                  <span className="heading-sm text-foreground">Filtering</span>
                  <div className="flex flex-col gap-1">
                    <Label isMuted>Must-have labels</Label>
                    <Input
                      placeholder="e.g. approved, 2026"
                      value={configuration.filters.mustHaveLabels}
                      onChange={(event) =>
                        onChange({
                          ...configuration,
                          filters: {
                            ...configuration.filters,
                            mustHaveLabels: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label isMuted>Must-not-have labels</Label>
                    <Input
                      placeholder="e.g. draft, archived"
                      value={configuration.filters.mustNotHaveLabels}
                      onChange={(event) =>
                        onChange({
                          ...configuration,
                          filters: {
                            ...configuration.filters,
                            mustNotHaveLabels: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        In-conversation filtering
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {configuration.filters.inConversationFiltering
                          ? "Disable"
                          : "Enable"}{" "}
                        in-conversation filtering
                      </span>
                    </div>
                    <SliderToggle
                      selected={configuration.filters.inConversationFiltering}
                      onClick={() =>
                        onChange({
                          ...configuration,
                          filters: {
                            ...configuration.filters,
                            inConversationFiltering:
                              !configuration.filters.inConversationFiltering,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              }
            />
            <Button
              size="xs"
              variant="outline"
              label="Manage selection"
              onClick={onManageSelection}
            />
          </div>
        </div>
        <div className="rounded-xl bg-muted-background p-3">
          {isEmptySelection ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="heading-sm text-foreground">
                {wantsTables ? "No table detected" : "No document detected"}
              </span>
              <Button
                size="xs"
                variant="outline"
                label="Select data sources"
                onClick={onManageSelection}
              />
            </div>
          ) : (
            <Tree>
              {Array.from(bySpace.entries()).map(([spaceId, spaceNodes]) => (
                <Tree.Item
                  key={spaceId}
                  label={getBuilderSpaceById(spaceId)?.name ?? spaceId}
                  visual={SpaceClosed}
                  type="node"
                  defaultCollapsed={false}
                >
                  {spaceNodes.map((node) => (
                    <Tree.Item
                      key={node.id}
                      label={node.title}
                      visual={node.icon}
                      type="leaf"
                      actions={
                        <Chip
                          size="mini"
                          label={node.kind === "table" ? "table" : "document"}
                        />
                      }
                      areActionsFading={false}
                    />
                  ))}
                </Tree.Item>
              ))}
            </Tree>
          )}
        </div>
      </div>
    </div>
  );
}

export function KnowledgeSheet({
  open,
  onOpenChange,
  selectedSpaceIds,
  initial,
  mode,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSpaceIds: string[];
  initial: KnowledgeConfiguration;
  mode: "create" | "edit";
  onSave: (configuration: KnowledgeConfiguration) => void;
}) {
  const [pageId, setPageId] = useState<"select" | "configure">("select");
  const [draft, setDraft] = useState<KnowledgeConfiguration>(initial);
  const [showDiscard, setShowDiscard] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setPageId(mode === "edit" ? "configure" : "select");
    }
  }, [open, initial, mode]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const wantsTables = draft.method === "tables";

  const requestClose = (next: boolean) => {
    if (!next && isDirty) {
      setShowDiscard(true);
      return;
    }
    onOpenChange(next);
  };

  const toggleNode = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      nodeIds: prev.nodeIds.includes(id)
        ? prev.nodeIds.filter((candidate) => candidate !== id)
        : [...prev.nodeIds, id],
    }));

  const pages: MultiPageSheetPage[] = [
    {
      id: "select",
      title: wantsTables ? "Select tables" : "Select data sources",
      description: wantsTables
        ? "Choose the tables to query for your processing method"
        : "Choose the data sources to include in your knowledge base",
      content: (
        <SelectionPage
          selectedSpaceIds={selectedSpaceIds}
          selectedNodeIds={draft.nodeIds}
          onToggleNode={toggleNode}
          onSetNodes={(ids) => setDraft((prev) => ({ ...prev, nodeIds: ids }))}
        />
      ),
      footerContent: (
        <SelectionFooter
          selectedNodeIds={draft.nodeIds}
          onRemove={toggleNode}
        />
      ),
    },
    {
      id: "configure",
      title: KNOWLEDGE_PAGE_TITLES[draft.method],
      description: "Select knowledge type and configure settings",
      content: (
        <ConfigurePage
          configuration={draft}
          onChange={setDraft}
          onManageSelection={() => setPageId("select")}
        />
      ),
    },
  ];

  const footer =
    pageId === "select"
      ? {
          leftButton: {
            label: "Cancel",
            variant: "outline" as const,
            onClick: () => requestClose(false),
          },
          rightButton: {
            label: "Next",
            variant: "primary" as const,
            disabled: draft.nodeIds.length === 0,
            onClick: () => setPageId("configure"),
          },
        }
      : {
          leftButton: {
            label: "Cancel",
            variant: "outline" as const,
            onClick: () => requestClose(false),
          },
          rightButton: {
            label: "Save",
            variant: "primary" as const,
            disabled: !draft.name.trim(),
            onClick: () => {
              onSave(draft);
              onOpenChange(false);
            },
          },
        };

  return (
    <>
      <MultiPageSheet open={open} onOpenChange={requestClose}>
        <MultiPageSheetContent
          pages={pages}
          currentPageId={pageId}
          onPageChange={(id) => setPageId(id as "select" | "configure")}
          size="xl"
          showNavigation={false}
          addFooterSeparator
          leftButton={footer.leftButton}
          rightButton={footer.rightButton}
        />
      </MultiPageSheet>
      <ConfirmDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        title="Unsaved changes"
        confirmLabel="Discard changes"
        confirmVariant="warning"
        onConfirm={() => onOpenChange(false)}
      >
        You have unsaved changes. Are you sure you want to close without saving?
      </ConfirmDialog>
    </>
  );
}

export const KNOWLEDGE_SPACE_OPTIONS = mockBuilderSpaces;
