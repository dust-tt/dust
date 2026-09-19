import {
  Avatar,
  Button,
  Chip,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Edit04,
  EyeOff,
  type MenuItem,
  Plus,
  Robot,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  ThumbsDown,
  ThumbsUp,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import {
  AGENT_SCOPE_INFO,
  formatBuildDate,
  formatBuildDateLong,
  getModelById,
  type ManagedAgent,
  MOCK_AGENT_TAGS,
  MOCK_MODELS,
  mockManagedAgents,
  withCurrentUserAsEditor,
} from "../data/build";
import { getUserById } from "../data/users";
import { BulkSelectionBar } from "./BulkSelectionBar";
import { AgentDetailsSheet } from "./BuildDetailSheets";
import {
  type BatchConfirmCopy,
  BatchConfirmDialog,
  buildSelectionColumn,
  FilterMenu,
} from "./buildTableShared";
import { EmptyState } from "./EmptyState";

// The product's Agents table, as the Build tab opens it. Rows tick, the bar at
// the bottom edits the lot, and a click opens the agent's sheet. Everything is
// held in this component's state, so an archive here is an archive for the rest
// of the session and nothing longer.

const TABS = [
  { id: "all", label: "All", tooltip: "All custom agents." },
  { id: "editable", label: "Editable by me", tooltip: "Agents you can edit." },
  { id: "default", label: "Default", tooltip: "Default agents from Dust." },
  { id: "archived", label: "Archived", tooltip: "Archived agents." },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * An agent is selectable only when the batch actions could do something to it:
 * a default agent has no editors and an archived one is already gone.
 */
function isAgentSelectable(agent: ManagedAgent): boolean {
  return agent.canEdit && agent.status === "active" && agent.scope !== "global";
}

type RowData = ManagedAgent & { onClick: () => void; menuItems: MenuItem[] };

// ── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<RowData>[] {
  return [
    buildSelectionColumn<RowData>("agent"),
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-3 py-3">
            <Avatar
              size="sm"
              emoji={info.row.original.emoji}
              backgroundColor={info.row.original.backgroundColor}
            />
            <div className="flex min-w-0 grow flex-col">
              <div className="heading-sm truncate text-foreground">
                {info.getValue()}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {info.row.original.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: { className: "w-40 @lg:w-full" },
    },
    {
      id: "model",
      accessorFn: (row: RowData) =>
        getModelById(row.modelId)?.name ?? row.modelId, // prettier-ignore
      header: "Model",
      cell: (info: CellContext<RowData, string>) => {
        const model = getModelById(info.row.original.modelId);
        return (
          <DataTable.CellContent>
            <Tooltip
              label={model ? `${model.maker} · ${model.tier}` : "Unknown model"}
              trigger={
                <span className="truncate text-sm">{info.getValue()}</span>
              }
            />
          </DataTable.CellContent>
        );
      },
      meta: { className: "hidden @sm:w-36 @sm:table-cell" },
    },
    {
      id: "scope",
      accessorKey: "scope",
      header: "Access",
      cell: (info: CellContext<RowData, ManagedAgent["scope"]>) => {
        const scope = AGENT_SCOPE_INFO[info.getValue()];
        return (
          <DataTable.CellContent>
            <Tooltip
              label={scope.tooltip}
              trigger={
                <Chip size="xs" color={scope.color} label={scope.label} />
              }
            />
          </DataTable.CellContent>
        );
      },
      meta: { className: "hidden @lg:w-32 @lg:table-cell" },
    },
    {
      id: "editors",
      accessorKey: "editorIds",
      header: "Editors",
      enableSorting: false,
      cell: (info: CellContext<RowData, string[]>) => {
        const editors = info.getValue().flatMap((id) => {
          const user = getUserById(id);
          return user ? [user] : [];
        });

        if (editors.length === 0) {
          return <DataTable.BasicCellContent label="-" />;
        }

        return (
          <DataTable.CellContent
            avatarStack={{
              items: editors.map((editor) => ({
                name: editor.fullName,
                visual: editor.portrait,
              })),
              nbVisibleItems: 4,
            }}
          />
        );
      },
      meta: { className: "hidden @lg:w-24 @lg:table-cell" },
    },
    {
      id: "tags",
      accessorFn: (row: RowData) => row.tags.join(", "),
      header: "Tags",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <span className="truncate text-sm text-muted-foreground">
            {info.getValue() || "-"}
          </span>
        </DataTable.CellContent>
      ),
      meta: { className: "hidden @lg:w-32 @lg:table-cell" },
    },
    {
      id: "usage",
      accessorKey: "usageCount",
      header: "Usage",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          className="font-mono"
          label={info.getValue().toLocaleString()}
          tooltip={`${info.getValue().toLocaleString()} messages over the last 30 days`}
        />
      ),
      meta: {
        className: "hidden @sm:w-20 @sm:table-cell",
        tooltip: "Messages over the last 30 days.",
      },
    },
    {
      id: "feedback",
      accessorFn: (row: RowData) => row.feedbackUp + row.feedbackDown,
      header: "Feedback",
      cell: (info: CellContext<RowData, number>) => {
        const { feedbackUp, feedbackDown, scope } = info.row.original;

        // A default agent is never anyone's to improve, so its ratings are
        // not reported here.
        if (scope === "global") {
          return <DataTable.BasicCellContent label="-" />;
        }

        return (
          <DataTable.CellContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ThumbsUp className="h-3 w-3" />
                {feedbackUp}
              </span>
              <span className="flex items-center gap-1">
                <ThumbsDown className="h-3 w-3" />
                {feedbackDown}
              </span>
            </div>
          </DataTable.CellContent>
        );
      },
      meta: { className: "hidden @lg:w-24 @lg:table-cell" },
    },
    {
      id: "lastEdited",
      accessorFn: (row: RowData) => row.updatedAt.getTime(),
      header: "Last Edited",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          label={formatBuildDate(info.row.original.updatedAt)}
          tooltip={formatBuildDateLong(info.row.original.updatedAt)}
        />
      ),
      meta: { className: "hidden @sm:w-32 @sm:table-cell" },
    },
    {
      id: "actions",
      accessorKey: "menuItems",
      header: "",
      enableSorting: false,
      cell: (info: CellContext<RowData, MenuItem[]>) => (
        <DataTable.MoreButton menuItems={info.getValue()} />
      ),
      meta: { className: "w-14" },
    },
  ];
}

// ── Batch bar ────────────────────────────────────────────────────────────────

type PendingBatch =
  | { kind: "model"; modelId: string }
  | { kind: "unpublish" }
  | { kind: "archive" };

const BATCH_COPY: Record<PendingBatch["kind"], BatchConfirmCopy> = {
  model: {
    title: "Set model",
    body: "They will all run on this model from their next message on.",
    confirmLabel: "Set model",
  },
  unpublish: {
    title: "Unpublish agents",
    body: "Members will no longer find them. Their editors still will.",
    confirmLabel: "Unpublish",
  },
  archive: {
    title: "Archive agents",
    body: "They drop out of every list. Their past conversations stay.",
    confirmLabel: "Archive",
    isWarning: true,
  },
};

function AgentBatchBar({
  selectedAgents,
  totalSelectableCount,
  onClear,
  onSelectAll,
  onToggleTag,
  onRequestBatch,
}: {
  selectedAgents: ManagedAgent[];
  totalSelectableCount: number;
  onClear: () => void;
  onSelectAll: () => void;
  onToggleTag: (tag: string) => void;
  onRequestBatch: (batch: PendingBatch) => void;
}) {
  const [tagSearch, setTagSearch] = useState("");

  const tags = MOCK_AGENT_TAGS.filter((tag) =>
    tag.toLowerCase().includes(tagSearch.trim().toLowerCase())
  );

  return (
    <BulkSelectionBar
      selectedCount={selectedAgents.length}
      totalCount={totalSelectableCount}
      itemLabel="agent"
      canSelectAll={selectedAgents.length < totalSelectableCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
    >
      <DropdownMenu onOpenChange={() => setTagSearch("")}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" isSelect label="Change tag" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuSearchbar
            name="tag-search"
            placeholder="Search tags"
            value={tagSearch}
            onChange={setTagSearch}
          />
          {tags.length === 0 ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              No tag matches.
            </div>
          ) : (
            tags.map((tag) => {
              // Ticking a tag every selected agent already carries takes it
              // off them instead, so one menu does both directions.
              const allHaveIt = selectedAgents.every((agent) =>
                agent.tags.includes(tag)
              );
              return (
                <DropdownMenuItem
                  key={tag}
                  label={tag}
                  description={allHaveIt ? "Remove from selection" : undefined}
                  onClick={() => onToggleTag(tag)}
                />
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" isSelect label="Set model" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel label="Set model" />
          {MOCK_MODELS.map((model) => (
            <DropdownMenuItem
              key={model.id}
              label={model.name}
              description={`${model.maker} · ${model.tier}`}
              onClick={() =>
                onRequestBatch({ kind: "model", modelId: model.id })
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="outline"
        icon={EyeOff}
        label="Unpublish"
        onClick={() => onRequestBatch({ kind: "unpublish" })}
      />
      <Button
        size="sm"
        variant="warning"
        icon={Trash01}
        label="Archive"
        onClick={() => onRequestBatch({ kind: "archive" })}
      />
    </BulkSelectionBar>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

interface ManageAgentsViewProps {
  /** Whose agents count as "editable by me". */
  currentUserId: string;
}

export function ManageAgentsView({ currentUserId }: ManageAgentsViewProps) {
  const [agents, setAgents] = useState<ManagedAgent[]>(() =>
    withCurrentUserAsEditor(
      mockManagedAgents,
      currentUserId,
      (agent) => agent.canEdit && agent.scope !== "global"
    )
  );
  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [modelFilters, setModelFilters] = useState<string[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [pendingBatch, setPendingBatch] = useState<PendingBatch | null>(null);
  const [detailedAgentId, setDetailedAgentId] = useState<string | null>(null);

  const agentsByTab = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesFilters = (agent: ManagedAgent) => {
      if (query) {
        const editorNames = agent.editorIds
          .map((id) => getUserById(id)?.fullName ?? "")
          .join(" ");
        const haystack = `${agent.name} ${editorNames}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      if (
        tagFilters.length > 0 &&
        !agent.tags.some((tag) => tagFilters.includes(tag))
      ) {
        return false;
      }
      return !(
        modelFilters.length > 0 && !modelFilters.includes(agent.modelId)
      );
    };

    const active = agents.filter(
      (agent) => agent.status === "active" && matchesFilters(agent)
    );

    return {
      all: active.filter((agent) => agent.scope !== "global"),
      editable: active.filter(
        (agent) => agent.canEdit && agent.editorIds.includes(currentUserId)
      ),
      default: active.filter((agent) => agent.scope === "global"),
      archived: agents.filter(
        (agent) => agent.status === "archived" && matchesFilters(agent)
      ),
    } satisfies Record<TabId, ManagedAgent[]>;
  }, [agents, currentUserId, modelFilters, search, tagFilters]);

  const visibleAgents = agentsByTab[tab];

  // An agent that drops out of view drops out of the selection with it, so the
  // bar never acts on a row nobody can see.
  const selectionScopeKey = `${tab}|${search}|${tagFilters.join()}|${modelFilters.join()}`;
  useEffect(() => {
    setRowSelection({});
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  }, [selectionScopeKey]);

  const selectableIds = useMemo(
    () => visibleAgents.filter(isAgentSelectable).map((agent) => agent.id),
    [visibleAgents]
  );

  const selectedAgents = useMemo(
    () => visibleAgents.filter((agent) => rowSelection[agent.id]),
    [rowSelection, visibleAgents]
  );

  const applyToSelection = (patch: (agent: ManagedAgent) => ManagedAgent) => {
    const selectedIds = new Set(selectedAgents.map((agent) => agent.id));
    setAgents((previous) =>
      previous.map((agent) =>
        selectedIds.has(agent.id) ? patch(agent) : agent
      )
    );
    setRowSelection({});
  };

  const handleToggleTag = (tag: string) => {
    const allHaveIt = selectedAgents.every((agent) => agent.tags.includes(tag));
    applyToSelection((agent) => ({
      ...agent,
      tags: allHaveIt
        ? agent.tags.filter((existing) => existing !== tag)
        : [...new Set([...agent.tags, tag])],
    }));
  };

  const handleConfirmBatch = () => {
    if (!pendingBatch) {
      return;
    }
    if (pendingBatch.kind === "model") {
      applyToSelection((agent) => ({
        ...agent,
        modelId: pendingBatch.modelId,
      }));
    } else if (pendingBatch.kind === "unpublish") {
      applyToSelection((agent) => ({ ...agent, scope: "hidden" }));
    } else {
      applyToSelection((agent) => ({ ...agent, status: "archived" }));
    }
    setPendingBatch(null);
  };

  const columns = useMemo(() => buildColumns(), []);

  const rows: RowData[] = useMemo(
    () =>
      visibleAgents.map((agent) => ({
        ...agent,
        onClick: () => setDetailedAgentId(agent.id),
        menuItems: [
          ...(agent.canEdit && agent.status === "active"
            ? [{ kind: "item" as const, label: "Edit", icon: Edit04 }]
            : []),
          {
            kind: "item" as const,
            label: "More info",
            icon: Robot,
            onClick: () => setDetailedAgentId(agent.id),
          },
          ...(agent.canEdit && agent.status === "active"
            ? [
                {
                  kind: "item" as const,
                  label: "Archive",
                  icon: Trash01,
                  variant: "warning" as const,
                  onClick: () =>
                    setAgents((previous) =>
                      previous.map((item) =>
                        item.id === agent.id
                          ? { ...item, status: "archived" }
                          : item
                      )
                    ),
                },
              ]
            : []),
        ],
      })),
    [visibleAgents]
  );

  const activeFilterCount = tagFilters.length + modelFilters.length;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background px-4">
      <div className="@container mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 pt-6 pb-8">
        <div className="flex items-center gap-2">
          <SearchInput
            name="agents-search"
            placeholder="Search (Name, Editors)"
            value={search}
            onChange={setSearch}
            className="w-full min-w-0 max-w-80"
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <FilterMenu
              label="Tags"
              options={MOCK_AGENT_TAGS.map((tag) => ({
                value: tag,
                label: tag,
              }))}
              selected={tagFilters}
              onChange={setTagFilters}
            />
            <FilterMenu
              label="Models"
              options={MOCK_MODELS.map((model) => ({
                value: model.id,
                label: model.name,
              }))}
              selected={modelFilters}
              onChange={setModelFilters}
            />
            <Button
              size="sm"
              variant="highlight"
              icon={Plus}
              label="New agent"
            />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagFilters.map((tag) => (
              <Chip
                key={tag}
                size="xs"
                label={tag}
                onRemove={() =>
                  setTagFilters((previous) => previous.filter((t) => t !== tag))
                }
              />
            ))}
            {modelFilters.map((modelId) => (
              <Chip
                key={modelId}
                size="xs"
                label={getModelById(modelId)?.name ?? modelId}
                onRemove={() =>
                  setModelFilters((previous) =>
                    previous.filter((id) => id !== modelId)
                  )
                }
              />
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <TabsList>
            {TABS.map((tabItem) => (
              <TabsTrigger
                key={tabItem.id}
                value={tabItem.id}
                label={tabItem.label}
                tooltip={tabItem.tooltip}
                isCounter={tabItem.id !== "archived"}
                counterValue={`${agentsByTab[tabItem.id].length}`}
              />
            ))}
          </TabsList>
        </Tabs>

        {rows.length === 0 ? (
          <EmptyState
            icon={Robot}
            title="No agents"
            description={
              search || activeFilterCount > 0
                ? "No agent matches your search."
                : "Nothing in this tab yet."
            }
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
            getRowId={(row) => row.id}
            enableRowSelection={(row) => isAgentSelectable(row.original)}
            disableRowClickSelection
            rowSelection={rowSelection}
            setRowSelection={setRowSelection}
          />
        )}

        <AgentBatchBar
          selectedAgents={selectedAgents}
          totalSelectableCount={selectableIds.length}
          onClear={() => setRowSelection({})}
          onSelectAll={() =>
            setRowSelection(
              Object.fromEntries(selectableIds.map((id) => [id, true]))
            )
          }
          onToggleTag={handleToggleTag}
          onRequestBatch={setPendingBatch}
        />
      </div>

      <BatchConfirmDialog
        copy={pendingBatch ? BATCH_COPY[pendingBatch.kind] : null}
        countLabel={`${selectedAgents.length} agent${selectedAgents.length === 1 ? "" : "s"}`}
        onCancel={() => setPendingBatch(null)}
        onConfirm={handleConfirmBatch}
      />

      <AgentDetailsSheet
        agentId={detailedAgentId}
        onClose={() => setDetailedAgentId(null)}
      />
    </div>
  );
}
