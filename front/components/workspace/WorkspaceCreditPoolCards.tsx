import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import { DAY_MS } from "@app/lib/api/analytics/time_utils";
import { formatCredits } from "@app/lib/client/credits";
import type { AwuPoolCycleBreakdown } from "@app/types/api/credits/awu_pool_summary";
import { DataTable, ValueCard } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function formatCycleDayLabel(
  currentCycleStartMs: number | null,
  currentCycleEndMs: number | null
): string | null {
  if (
    currentCycleStartMs === null ||
    currentCycleEndMs === null ||
    currentCycleEndMs <= currentCycleStartMs
  ) {
    return null;
  }
  const totalDays = Math.round(
    (currentCycleEndMs - currentCycleStartMs) / DAY_MS
  );
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, Math.ceil((Date.now() - currentCycleStartMs) / DAY_MS))
  );
  return `Day ${elapsedDays}/${totalDays}`;
}

interface WorkspaceCreditPoolValueCardsProps {
  totalRemainingCredits: number;
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  isLoading: boolean;
}

export function WorkspaceCreditPoolValueCards({
  totalRemainingCredits,
  currentCycleConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  isLoading,
}: WorkspaceCreditPoolValueCardsProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <ValueCard
        title="Remaining credits pool"
        isLoading={isLoading}
        content={
          <div className="truncate text-2xl text-foreground">
            {formatCredits(totalRemainingCredits)}
          </div>
        }
      />
      <ValueCard
        title="Consumed this cycle"
        isLoading={isLoading}
        content={
          <div className="flex items-baseline gap-2">
            <div className="truncate text-2xl text-foreground">
              {typeof currentCycleConsumedCredits === "number"
                ? formatCredits(currentCycleConsumedCredits)
                : "—"}
            </div>
            {cycleDayLabel && (
              <span className="copy-sm text-muted-foreground">
                {cycleDayLabel}
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}

interface WorkspaceExcessCreditsValueCardProps {
  excessConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  isLoading: boolean;
}

// For workspaces with no credit pool (PAYG-only, "excess credit
// consumption"): the pool's "remaining"/"consumed this cycle" pair doesn't
// apply since there's nothing prepaid, so this shows a single figure instead.
export function WorkspaceExcessCreditsValueCard({
  excessConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  isLoading,
}: WorkspaceExcessCreditsValueCardProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <ValueCard
      title="Consumed this cycle"
      isLoading={isLoading}
      content={
        <div className="flex items-baseline gap-2">
          <div className="truncate text-2xl text-foreground">
            {typeof excessConsumedCredits === "number"
              ? formatCredits(excessConsumedCredits)
              : "—"}
          </div>
          {cycleDayLabel && (
            <span className="copy-sm text-muted-foreground">
              {cycleDayLabel}
            </span>
          )}
        </div>
      }
    />
  );
}

interface WorkspaceCreditPoolCycleHistoryTableProps {
  cycleBreakdown: AwuPoolCycleBreakdown[];
}

type CycleHistoryRowData = {
  cycle: string;
  consumedCredits: string;
  onClick?: () => void;
};

const CYCLE_HISTORY_COLUMNS: ColumnDef<CycleHistoryRowData, string>[] = [
  {
    accessorKey: "cycle",
    header: "Cycle",
    enableSorting: false,
    cell: ({ row }) => (
      <DataTable.CellContent>{row.original.cycle}</DataTable.CellContent>
    ),
  },
  {
    accessorKey: "consumedCredits",
    header: "Credits consumed",
    enableSorting: false,
    meta: { headerAlign: "right" },
    cell: ({ row }) => (
      <span className="block text-right text-sm">
        {row.original.consumedCredits}
      </span>
    ),
  },
];

export function WorkspaceCreditPoolCycleHistoryTable({
  cycleBreakdown,
}: WorkspaceCreditPoolCycleHistoryTableProps) {
  if (cycleBreakdown.length === 0) {
    return null;
  }
  const rows: CycleHistoryRowData[] = cycleBreakdown.map((cycle) => ({
    cycle:
      cycle.cycleStartMs && cycle.cycleEndMs
        ? `${formatConsumptionDate(cycle.cycleStartMs)} – ${formatConsumptionDate(cycle.cycleEndMs)}`
        : "Unknown cycle",
    consumedCredits: formatCredits(Math.round(cycle.consumedCredits)),
  }));
  return <DataTable data={rows} columns={CYCLE_HISTORY_COLUMNS} />;
}
