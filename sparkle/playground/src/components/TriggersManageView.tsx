import {
  ArrowDown,
  ArrowUp,
  Button,
  ChevronDown,
  ChevronSelectorVertical,
  ChevronUp,
  cn,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterFunnel01,
  Icon,
  SearchInput,
  SliderToggle,
  Tooltip,
  Zap,
} from "@dust-tt/sparkle";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment, useCallback, useMemo, useState } from "react";

import { getAgentById } from "../data/agents";
import {
  formatCredits,
  formatCreditsCompact,
  getTriggerDescription,
  TRIGGER_POOL_LABELS,
} from "../data/triggers";
import type { Trigger, TriggerPool } from "../data/types";
import { EmptyState } from "./EmptyState";
import { TriggerRunAvatar } from "./TriggerRunAvatar";

interface TriggersManageViewProps {
  triggers: Trigger[];
  /** Only the triggers this member owns are theirs to manage. */
  currentUserId?: string;
  onToggleTrigger?: (triggerId: string, enabled: boolean) => void;
  onSetTriggerPool?: (triggerId: string, pool: TriggerPool) => void;
}

/** A manager's decision outranks the owner's, so the owner cannot undo it. */
const LOCKED_TOOLTIP = "Disabled by a manager or admin, who can re-enable it.";

/** Biggest spender first: the table is read to find where the credits went. */
const DEFAULT_SORTING: SortingState = [{ id: "credits", desc: true }];

const POOL_OPTIONS: { value: TriggerPool; label: string }[] = [
  { value: "member", label: TRIGGER_POOL_LABELS.member },
  { value: "workspace", label: TRIGGER_POOL_LABELS.workspace },
];

/** The agent leads the row, badged with what makes the trigger fire. */
function AgentCell({ trigger }: { trigger: Trigger }) {
  const agent = getAgentById(trigger.agentId);

  return (
    <Tooltip
      label={getTriggerDescription(trigger)}
      tooltipTriggerAsChild
      trigger={
        <div className="flex min-w-0 items-center gap-3">
          <TriggerRunAvatar trigger={trigger} />
          <span className="truncate text-sm">
            {agent?.name ?? "Unknown agent"}
          </span>
        </div>
      }
    />
  );
}

function StatusCell({
  trigger,
  onToggle,
}: {
  trigger: Trigger;
  onToggle?: (enabled: boolean) => void;
}) {
  if (trigger.status === "disabled_by_manager") {
    return (
      <Tooltip
        label={LOCKED_TOOLTIP}
        trigger={
          // A disabled SliderToggle needs a wrapper to be a valid Tooltip
          // trigger.
          <div>
            <SliderToggle selected={false} disabled />
          </div>
        }
      />
    );
  }

  const isEnabled = trigger.status === "enabled";
  return (
    <SliderToggle
      selected={isEnabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.(!isEnabled);
      }}
    />
  );
}

function PoolCell({
  trigger,
  onSetPool,
}: {
  trigger: Trigger;
  onSetPool?: (pool: TriggerPool) => void;
}) {
  const isWorkspacePool = trigger.pool === "workspace";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          isSelect
          className={isWorkspacePool ? "text-highlight" : undefined}
          label={TRIGGER_POOL_LABELS[trigger.pool]}
          onClick={(event) => event.stopPropagation()}
        />
      </DropdownMenuTrigger>
      {/* A portal's clicks still bubble through the React tree, so without this
          picking a pool would also open the row's breakdown. */}
      <DropdownMenuContent onClick={(event) => event.stopPropagation()}>
        {POOL_OPTIONS.map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            label={label}
            onClick={() => onSetPool?.(value)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the expanded row says about a trigger, one figure per column. */
function BreakdownField({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <div className="min-w-0 text-xs">
        <span className="font-semibold text-foreground">{value}</span>{" "}
        <span className="text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}

function TriggerBreakdown({ trigger }: { trigger: Trigger }) {
  const creditsPerRun =
    trigger.runCount > 0 ? trigger.credits / trigger.runCount : 0;

  return (
    <div className="grid grid-cols-3 gap-16 border-b border-separator px-2 pt-4 pb-6">
      <BreakdownField
        label="How often it runs"
        value={String(trigger.runCount)}
        caption={
          trigger.runCount === 1 ? "time this month" : "times this month"
        }
      />
      <BreakdownField
        label="What each run costs"
        value={trigger.runCount > 0 ? formatCredits(creditsPerRun) : "—"}
        caption={trigger.runCount > 0 ? "credits on average" : "it never ran"}
      />
      <BreakdownField
        label="Who pays for it"
        value={TRIGGER_POOL_LABELS[trigger.pool]}
        caption={
          trigger.pool === "workspace"
            ? "pool, shared by everyone"
            : "credits, yours alone"
        }
      />
    </div>
  );
}

function buildColumns({
  onToggleTrigger,
  onSetTriggerPool,
  onToggleDetails,
  expandedTriggerId,
}: {
  onToggleTrigger?: (triggerId: string, enabled: boolean) => void;
  onSetTriggerPool?: (triggerId: string, pool: TriggerPool) => void;
  onToggleDetails: (triggerId: string) => void;
  expandedTriggerId: string | null;
}): ColumnDef<Trigger>[] {
  return [
    {
      id: "agent",
      header: "Agent",
      enableSorting: false,
      meta: { className: "w-52", headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <AgentCell trigger={info.row.original} />
        </DataTable.CellContent>
      ),
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
      meta: { className: "truncate", headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start text-left">
          <span className="truncate text-sm font-semibold">
            {info.row.original.name}
          </span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "credits",
      accessorKey: "credits",
      header: "Credits",
      meta: { className: "w-24", headerAlign: "right" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-end text-right">
          <Tooltip
            label={`${formatCredits(info.row.original.credits)} credits`}
            tooltipTriggerAsChild
            trigger={
              <span className="text-sm">
                {formatCreditsCompact(info.row.original.credits)}
              </span>
            }
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "pool",
      header: "Pool",
      enableSorting: false,
      meta: { className: "w-28" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <PoolCell
            trigger={info.row.original}
            onSetPool={(pool) => onSetTriggerPool?.(info.row.original.id, pool)}
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "status",
      header: "Enabled",
      enableSorting: false,
      meta: { className: "w-16" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-center">
          <StatusCell
            trigger={info.row.original}
            onToggle={(enabled) =>
              onToggleTrigger?.(info.row.original.id, enabled)
            }
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { className: "w-24" },
      cell: () => (
        <DataTable.CellContent className="w-full justify-end">
          <Button
            variant="outline"
            size="xs"
            label="Manage"
            onClick={(event) => event.stopPropagation()}
          />
        </DataTable.CellContent>
      ),
    },
    {
      id: "details",
      header: "",
      enableSorting: false,
      meta: { className: "w-12" },
      cell: (info) => {
        const trigger = info.row.original;
        const isExpanded = expandedTriggerId === trigger.id;
        return (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              icon={isExpanded ? ChevronUp : ChevronDown}
              variant="ghost-secondary"
              size="xs"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} breakdown for ${trigger.name}`}
              aria-expanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                onToggleDetails(trigger.id);
              }}
            />
          </DataTable.CellContent>
        );
      },
    },
  ];
}

/**
 * The triggers the current member owns — the product lists these in its
 * Automations table, with what each one has spent, and only their editor can
 * turn one on or off. A row opens on what makes up that spending.
 */
export function TriggersManageView({
  triggers,
  currentUserId,
  onToggleTrigger,
  onSetTriggerPool,
}: TriggersManageViewProps) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [expandedTriggerId, setExpandedTriggerId] = useState<string | null>(
    null
  );

  const ownedTriggers = useMemo(
    () =>
      currentUserId
        ? triggers.filter((trigger) => trigger.editorId === currentUserId)
        : triggers,
    [currentUserId, triggers]
  );

  // A member looking for a trigger knows it either by its own name or by the
  // agent it runs, so both answer the search.
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return ownedTriggers;
    }
    return ownedTriggers.filter((trigger) => {
      const agentName = getAgentById(trigger.agentId)?.name ?? "";
      return (
        trigger.name.toLowerCase().includes(query) ||
        agentName.toLowerCase().includes(query)
      );
    });
  }, [ownedTriggers, search]);

  const toggleDetails = useCallback(
    (triggerId: string) =>
      setExpandedTriggerId((current) =>
        current === triggerId ? null : triggerId
      ),
    []
  );

  const columns = useMemo(
    () =>
      buildColumns({
        onToggleTrigger,
        onSetTriggerPool,
        onToggleDetails: toggleDetails,
        expandedTriggerId,
      }),
    [onToggleTrigger, onSetTriggerPool, toggleDetails, expandedTriggerId]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background px-4">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-2 pt-6 pb-8">
        {ownedTriggers.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No triggers"
            description="You haven't created any trigger yet."
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <SearchInput
                name="triggers-search"
                placeholder="Search automations"
                value={search}
                onChange={setSearch}
                className="w-full min-w-0 max-w-80"
              />
              <Button
                icon={FilterFunnel01}
                label="Filters"
                size="sm"
                variant="outline"
                className="ml-auto shrink-0"
              />
            </div>

            {rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No trigger matches your search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <DataTable.Root className="min-w-150">
                  <DataTable.Header>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <DataTable.Row
                        key={headerGroup.id}
                        widthClassName="w-full"
                      >
                        {headerGroup.headers.map((header) => (
                          <DataTable.Head
                            column={header.column}
                            key={header.id}
                            onClick={
                              header.column.getCanSort()
                                ? header.column.getToggleSortingHandler()
                                : undefined
                            }
                            className={cn(
                              header.column.getCanSort() && "cursor-pointer"
                            )}
                          >
                            <div
                              className={cn(
                                "flex items-center space-x-1 whitespace-nowrap",
                                header.column.columnDef.meta?.headerAlign ===
                                  "right" && "justify-end",
                                header.column.columnDef.meta?.headerAlign ===
                                  "center" && "justify-center"
                              )}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {header.column.getCanSort() && (
                                <Icon
                                  visual={
                                    header.column.getIsSorted() === "asc"
                                      ? ArrowUp
                                      : header.column.getIsSorted() === "desc"
                                        ? ArrowDown
                                        : ChevronSelectorVertical
                                  }
                                  size="xs"
                                  className="ml-1"
                                />
                              )}
                            </div>
                          </DataTable.Head>
                        ))}
                      </DataTable.Row>
                    ))}
                  </DataTable.Header>
                  <DataTable.Body>
                    {table.getRowModel().rows.map((row) => {
                      const isExpanded = expandedTriggerId === row.original.id;
                      return (
                        <Fragment key={row.id}>
                          <DataTable.Row
                            widthClassName="w-full"
                            onClick={() => toggleDetails(row.original.id)}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <DataTable.Cell
                                column={cell.column}
                                key={cell.id}
                                // A row carries an avatar and a toggle, which
                                // the table's default height sits tight around.
                                className="h-14"
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </DataTable.Cell>
                            ))}
                          </DataTable.Row>
                          {isExpanded && (
                            <tr>
                              <td
                                className="max-w-0"
                                colSpan={row.getVisibleCells().length}
                              >
                                <TriggerBreakdown trigger={row.original} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </DataTable.Body>
                </DataTable.Root>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
