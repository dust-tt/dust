import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokePlanCellUsage } from "@app/hooks/usePokePlanUsageAllCells";
import { usePokePlanUsageAllCells } from "@app/hooks/usePokePlanUsageAllCells";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { getCellChipColor, getCellDisplay } from "@app/lib/poke/cells";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import type { PokeWorkspaceWithCell } from "@app/poke/swr/search";
import { usePokeWorkspacesAllCells } from "@app/poke/swr/search";
import type { CellType } from "@app/types/cell";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { Chip, LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const WORKSPACES_PAGE_SIZE = 25;

interface MakeColumnsParams {
  onSwitchCell: (cell: CellType) => void;
}

function makeColumns({
  onSwitchCell,
}: MakeColumnsParams): ColumnDef<PokeWorkspaceWithCell>[] {
  return [
    {
      accessorKey: "name",
      header: "Workspace",
      cell: ({ row }) => (
        <div onClick={() => onSwitchCell(row.original.cell)}>
          <LinkWrapper href={`/poke/${row.original.sId}`}>
            <span className="text-highlight-600 hover:underline">
              {row.original.name}
            </span>
          </LinkWrapper>
        </div>
      ),
    },
    {
      accessorKey: "sId",
      header: "Workspace ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.sId}
        </span>
      ),
    },
    {
      accessorKey: "membersCount",
      header: "Members",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.membersCount}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created at",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {dateToHumanReadable(new Date(row.original.createdAt))}
        </span>
      ),
    },
  ];
}

interface CellUsageChipProps {
  isSelected: boolean;
  onSelect: (cell: CellType) => void;
  usage: PokePlanCellUsage;
}

function CellUsageChip({ isSelected, onSelect, usage }: CellUsageChipProps) {
  const countLabel =
    usage.workspaceCount === null
      ? "plan absent"
      : usage.workspaceCount.toLocaleString();

  return (
    <Chip
      size="xs"
      color={isSelected ? getCellChipColor(usage.region) : "primary"}
      label={`${getCellDisplay({ name: usage.cell, region: usage.region })}: ${countLabel}`}
      onClick={() => onSelect(usage.cell)}
    />
  );
}

export function PlanDetailPage() {
  const planCode = useRequiredPathParam("planCode");

  usePokePageMetadata({ name: planCode });

  const { cells, cellInfo, setCellInfo } = useCellContext();

  const {
    plan,
    cellUsages,
    totalCount,
    isLoading: isUsageLoading,
    isError: isUsageError,
  } = usePokePlanUsageAllCells({ planCode });

  // Until a cell chip is picked, the list follows the globally selected cell, the same way the
  // dashboard's upgraded-workspaces list does.
  const [cellFilter, setCellFilter] = useState<CellType | undefined>(undefined);
  const selectedCell = cellFilter ?? cellInfo.name;

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: WORKSPACES_PAGE_SIZE,
  });

  const { workspaces, isWorkspacesLoading, isWorkspacesError } =
    usePokeWorkspacesAllCells({
      planCode,
      cell: selectedCell,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      cells,
    });

  const handleCellSelect = useCallback((cell: CellType) => {
    setCellFilter(cell);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  // Workspace pages are served by the cell that owns the workspace, so following a link into
  // another cell has to move the poke cell context with it.
  const switchToCell = useCallback(
    (cell: CellType) => {
      const targetCell = cells.find((c) => c.name === cell);
      if (targetCell && targetCell.name !== cellInfo.name) {
        setCellInfo(targetCell);
      }
    },
    [cells, cellInfo, setCellInfo]
  );

  const columns = useMemo(
    () => makeColumns({ onSwitchCell: switchToCell }),
    [switchToCell]
  );

  const selectedCellInfo =
    cells.find((cell) => cell.name === selectedCell) ?? cellInfo;
  const selectedCellCount =
    cellUsages.find((usage) => usage.cell === selectedCell)?.workspaceCount ??
    0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <LinkWrapper href="/poke/plans">
          <span className="text-sm text-highlight-600 hover:underline">
            ← All plans
          </span>
        </LinkWrapper>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{plan?.name ?? planCode}</h1>
          <span className="font-mono text-sm text-muted-foreground">
            {planCode}
          </span>
        </div>
        {isUsageError ? (
          <p className="mt-1 text-sm text-warning-600">
            Could not load the subscriber counts for every cell; the totals
            below are incomplete.
          </p>
        ) : (
          !isUsageLoading &&
          !plan && (
            <p className="mt-1 text-sm text-warning-600">
              No plan with this code exists in any cell.
            </p>
          )
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {isUsageLoading
              ? "Counting subscribers across all cells…"
              : `${totalCount.toLocaleString()} workspace${pluralize(totalCount)} across all cells:`}
          </span>
          {cellUsages.map((usage) => (
            <CellUsageChip
              key={usage.cell}
              usage={usage}
              isSelected={usage.cell === selectedCell}
              onSelect={handleCellSelect}
            />
          ))}
        </div>
      </div>

      {isWorkspacesError ? (
        <p className="text-sm text-warning-600">
          Could not load the workspaces on this plan.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Showing {getCellDisplay(selectedCellInfo)}. Pick another cell above
            to page through its workspaces.
          </p>
          <PokeDataTable
            columns={columns}
            data={workspaces}
            isLoading={isWorkspacesLoading}
            serverSideRowCount={selectedCellCount}
            pagination={pagination}
            onPaginationChange={setPagination}
          />
        </>
      )}
    </div>
  );
}
