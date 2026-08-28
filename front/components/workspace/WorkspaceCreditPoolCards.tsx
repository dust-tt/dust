import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import type { AwuPoolCycleBreakdown } from "@app/types/api/credits/awu_pool_summary";
import { DataTable, ValueCard } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "Day 16/30": the elapsed/total day count for the current billing cycle,
// next to the "Consumed this cycle" figure — a quicker read on whether
// consumption is on pace than the raw credits number alone.
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
    (currentCycleEndMs - currentCycleStartMs) / MS_PER_DAY
  );
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, Math.ceil((Date.now() - currentCycleStartMs) / MS_PER_DAY))
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

// Two at-a-glance figures instead of a single consumed/total ratio, since
// "how much is left" and "how much did this cycle draw" are two different
// questions an admin asks about the pool, not one.
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

// Up to the last 5 finalized cycles with non-zero pool consumption
// (`cycleBreakdown`, most recent first) — a cycle-by-cycle view is a clearer
// way to judge a consumption trend than a single-number projection.
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
