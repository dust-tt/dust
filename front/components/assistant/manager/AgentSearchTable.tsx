import { SCOPE_INFO } from "@app/components/assistant/details/AgentDetailsSheet";
import { AgentSearchActionsMenu } from "@app/components/assistant/manager/AgentSearchActionsMenu";
import {
  SkillEditorsCell,
  SkillLastEditedCell,
} from "@app/components/skills/SkillTableCells";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  AvatarCellSkeleton,
  Checkbox,
  Chip,
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  Label,
  LoadingBlock,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

// Leave room for Select, Usage and Actions, then Editors/Last edited at sm and Access at md.
export const AGENT_SEARCH_NAME_COLUMN_WIDTH =
  "w-[calc(100%-12rem)] sm:w-[calc(100%-28rem)] md:w-[calc(100%-38rem)]";

type AgentSearchItem = SearchAgentsResponseBody["agents"][number];

interface AgentSearchTableProps {
  owner: LightWorkspaceType;
  agents: AgentSearchItem[];
  onSelect: (agentId: string) => void;
  onRefresh: () => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  total: number;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  isLoading: boolean;
  selectedAgentIds: string[];
  setSelectedAgentIds: (agentIds: string[]) => void;
  canSelect: (agent: AgentSearchItem) => boolean;
}

type AgentSearchRow = AgentSearchItem & { onClick: () => void };

export function AgentSearchTable({
  owner,
  agents,
  onSelect,
  onRefresh,
  pagination,
  setPagination,
  total,
  sorting,
  setSorting,
  isLoading,
  selectedAgentIds,
  setSelectedAgentIds,
  canSelect,
}: AgentSearchTableProps) {
  const columns = useMemo(
    () =>
      [
        {
          id: "select" as const,
          header: ({ table }) => {
            const areAllPageRowsSelected = table.getIsAllPageRowsSelected();
            const hasSelection = Object.values(
              table.getState().rowSelection
            ).some((isSelected) => isSelected);

            return (
              <DataTable.CellContent className="size-full items-center justify-center">
                <Checkbox
                  checked={
                    areAllPageRowsSelected
                      ? true
                      : hasSelection
                        ? "partial"
                        : false
                  }
                  disabled={
                    !table.getRowModel().rows.some((row) => row.getCanSelect())
                  }
                  tooltip={
                    areAllPageRowsSelected
                      ? "Clear selection"
                      : "Select all on page"
                  }
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      table.toggleAllPageRowsSelected(true);
                    } else {
                      // Unticking clears the whole selection across pages.
                      table.resetRowSelection();
                    }
                  }}
                />
              </DataTable.CellContent>
            );
          },
          cell: ({ row }) => {
            if (!row.getCanSelect()) {
              return null;
            }
            const checkboxId = `select-agent-${row.id}`;
            return (
              // Keep the click from reaching the row, which opens the agent details.
              <Label
                htmlFor={checkboxId}
                className="flex size-full cursor-pointer items-center justify-center hover:bg-muted-background"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  id={checkboxId}
                  aria-label={
                    row.getIsSelected()
                      ? `Deselect ${row.original.name}`
                      : `Select ${row.original.name}`
                  }
                  checked={row.getIsSelected()}
                  onCheckedChange={(checked) => row.toggleSelected(!!checked)}
                />
              </Label>
            );
          },
          meta: { className: "w-10 p-0" },
        },
        {
          id: "name" as const,
          accessorKey: "name",
          header: "Name",
          sortDescFirst: false,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <DataTable.CellContent>
              <button type="button" className="w-full min-w-0 text-left">
                <div className="flex flex-row items-center gap-2 py-3">
                  <div>
                    <Avatar visual={agent.pictureUrl} size="sm" />
                  </div>
                  <div className="flex min-w-0 grow flex-col">
                    <div className="heading-sm overflow-hidden truncate text-foreground">
                      {agent.name}
                    </div>
                    <div className="overflow-hidden truncate text-sm text-muted-foreground">
                      {agent.description}
                    </div>
                  </div>
                </div>
              </button>
            </DataTable.CellContent>
          ),
          meta: { className: AGENT_SEARCH_NAME_COLUMN_WIDTH },
        },
        {
          id: "access" as const,
          header: "Access",
          cell: ({ row: { original: agent } }) => (
            <DataTable.CellContent>
              {agent.scope !== "hidden" && (
                <Chip
                  size="xs"
                  label={SCOPE_INFO[agent.scope].shortLabel}
                  color={SCOPE_INFO[agent.scope].color}
                  icon={SCOPE_INFO[agent.scope].icon}
                />
              )}
            </DataTable.CellContent>
          ),
          meta: { className: "hidden w-40 md:table-cell" },
        },
        {
          id: "usage" as const,
          accessorKey: "activeUsersCount",
          header: "Usage",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <DataTable.BasicCellContent
              label={agent.activeUsersCount?.toLocaleString() ?? "-"}
              tooltip={
                agent.activeUsersCount === null
                  ? "Usage is not available for this agent."
                  : "Number of active users in the last 30 days."
              }
            />
          ),
          meta: { className: "w-24 font-mono tabular-nums" },
        },
        {
          id: "editors" as const,
          header: "Editors",
          cell: ({ row: { original: agent } }) => (
            <SkillEditorsCell
              editors={agent.scope === "global" ? null : agent.editors}
            />
          ),
          meta: { className: "hidden w-32 sm:table-cell" },
        },
        {
          id: "updatedAt" as const,
          accessorKey: "updatedAt",
          header: "Last edited",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <SkillLastEditedCell updatedAt={agent.updatedAt} emptyLabel="-" />
          ),
          meta: { className: "hidden w-32 sm:table-cell" },
        },
        {
          id: "actions" as const,
          header: "",
          cell: ({ row: { original: agent } }) =>
            agent.status === "archived" ? null : (
              <AgentSearchActionsMenu
                owner={owner}
                agentId={agent.sId}
                scope={agent.scope}
                onSelect={onSelect}
                onRefresh={onRefresh}
              />
            ),
          meta: { className: "w-14" },
        },
      ] satisfies ColumnDef<AgentSearchRow>[],
    [onRefresh, onSelect, owner]
  );

  // Show skeletons only when no rows are available; keep previous results during refreshes.
  if (isLoading && agents.length === 0) {
    return (
      <div role="status" aria-label="Loading agents">
        <DataTableSkeleton
          columns={columns}
          rowHeight={64}
          SkeletonCell={({ columnId, rowIndex }) => {
            switch (columnId) {
              case "select":
                return <LoadingBlock className="h-4 w-4 rounded-sm" />;
              case "name":
                return (
                  <AvatarCellSkeleton avatarClassName="h-9 w-9 rounded-lg">
                    <TextCellSkeleton
                      className={rowIndex % 2 === 0 ? "h-4 w-32" : "h-4 w-40"}
                    />
                    <TextCellSkeleton className="h-4 w-3/4" />
                  </AvatarCellSkeleton>
                );
              case "access":
                return <ChipCellSkeleton />;
              case "usage":
                return <TextCellSkeleton className="w-8" />;
              case "editors":
                return (
                  <div className="flex -space-x-2">
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                  </div>
                );
              case "updatedAt":
                return <TextCellSkeleton className="w-20" />;
              case "actions":
                return <LoadingBlock className="h-6 w-6 rounded-md" />;
              default:
                assertNeverAndIgnore(columnId);
                return null;
            }
          }}
        />
      </div>
    );
  }

  return (
    <DataTable
      data={agents.map((agent) => ({
        ...agent,
        onClick: () => onSelect(agent.sId),
      }))}
      columns={columns}
      getRowId={(agent) => agent.sId}
      enableRowSelection={(row) => canSelect(row.original)}
      disableRowClickSelection
      rowSelection={Object.fromEntries(
        selectedAgentIds.map((agentId) => [agentId, true])
      )}
      setRowSelection={(rowSelection) =>
        setSelectedAgentIds(
          Object.keys(rowSelection).filter((agentId) => rowSelection[agentId])
        )
      }
      isLoading={isLoading}
      pagination={pagination}
      setPagination={setPagination}
      sorting={sorting}
      setSorting={setSorting}
      isServerSideSorting
      totalRowCount={total}
    />
  );
}
