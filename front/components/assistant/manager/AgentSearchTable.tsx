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
  Chip,
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  LoadingBlock,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

// Leave room for Usage and Actions, then Editors/Last edited at sm and Access at md.
export const AGENT_SEARCH_NAME_COLUMN_WIDTH =
  "w-[calc(100%-9.5rem)] sm:w-[calc(100%-25.5rem)] md:w-[calc(100%-35.5rem)]";

type AgentSearchItem = SearchAgentsResponseBody["agents"][number];

interface AgentSearchTableProps {
  owner: LightWorkspaceType;
  agents: AgentSearchItem[];
  onSelect: (agentId: string) => void;
  onRefresh: () => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  hasMore: boolean;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  isLoading: boolean;
}

type AgentSearchRow = AgentSearchItem & { onClick: () => void };

export function AgentSearchTable({
  owner,
  agents,
  onSelect,
  onRefresh,
  pagination,
  setPagination,
  hasMore,
  sorting,
  setSorting,
  isLoading,
}: AgentSearchTableProps) {
  const columns = useMemo(
    () =>
      [
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
      isLoading={isLoading}
      pagination={pagination}
      setPagination={setPagination}
      sorting={sorting}
      setSorting={setSorting}
      isServerSideSorting
      totalRowCount={
        hasMore
          ? (pagination.pageIndex + 1) * pagination.pageSize + 1
          : pagination.pageIndex * pagination.pageSize + agents.length
      }
      rowCountIsCapped={hasMore}
      disablePaginationNumbers
    />
  );
}
