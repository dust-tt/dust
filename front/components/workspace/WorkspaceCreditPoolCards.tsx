import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import { DAY_MS } from "@app/lib/api/analytics/time_utils";
import { formatCredits } from "@app/lib/client/credits";
import type { AwuPoolCycleBreakdown } from "@app/types/api/credits/awu_pool_summary";
import {
  AlertCircle,
  ContentMessage,
  DataTable,
  Page,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

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
  programmaticConsumedCredits: number | null;
  isLoading: boolean;
}

export function WorkspaceCreditPoolValueCards({
  totalRemainingCredits,
  currentCycleConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  isLoading,
}: WorkspaceCreditPoolValueCardsProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <div className="grid grid-cols-3 gap-4">
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
      <ValueCard
        title="Programmatic usage"
        isLoading={isLoading}
        content={
          <div className="truncate text-2xl text-foreground">
            {typeof programmaticConsumedCredits === "number"
              ? formatCredits(programmaticConsumedCredits)
              : "—"}
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
  programmaticConsumedCredits: number | null;
  isLoading: boolean;
}

export function WorkspaceExcessCreditsValueCard({
  excessConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  isLoading,
}: WorkspaceExcessCreditsValueCardProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <div className="grid grid-cols-2 gap-4">
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
      <ValueCard
        title="Programmatic usage"
        isLoading={isLoading}
        content={
          <div className="truncate text-2xl text-foreground">
            {typeof programmaticConsumedCredits === "number"
              ? formatCredits(programmaticConsumedCredits)
              : "—"}
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

interface WorkspaceCreditPoolSectionProps {
  isLoading: boolean;
  isError: boolean;
  showPoolBranch: boolean;
  isVisible: boolean;
  totalRemainingCredits: number;
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  cycleBreakdown: AwuPoolCycleBreakdown[];
  excessConsumedCredits: number | null;
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  programmaticConsumedCredits: number | null;
  poolSecondaryContent?: ReactNode;
  footer?: ReactNode;
}

// Single source of truth for the "Workspace credit pool" / "Excess credit
// consumption" block so the customer-facing usage page and its Poke mirror
// can't drift from each other on this section's structure
export function WorkspaceCreditPoolSection({
  isLoading,
  isError,
  showPoolBranch,
  isVisible,
  totalRemainingCredits,
  currentCycleConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  cycleBreakdown,
  excessConsumedCredits,
  excessCycleBreakdown,
  programmaticConsumedCredits,
  poolSecondaryContent,
  footer,
}: WorkspaceCreditPoolSectionProps) {
  if (!isLoading && !isError && !isVisible) {
    return null;
  }

  return (
    <Page.Vertical gap="xs" align="stretch">
      <Page.H variant="h4">
        {showPoolBranch ? "Workspace credit pool" : "Excess credit consumption"}
      </Page.H>

      {isError ? (
        <ContentMessage
          title="Failed to load Workspace Credits Pool"
          icon={AlertCircle}
          variant="warning"
        >
          An error occurred while loading the workspace&apos;s credit pool data.
        </ContentMessage>
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : showPoolBranch ? (
        <>
          <WorkspaceCreditPoolValueCards
            totalRemainingCredits={totalRemainingCredits}
            currentCycleConsumedCredits={currentCycleConsumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            isLoading={false}
          />
          {poolSecondaryContent}
          <WorkspaceCreditPoolCycleHistoryTable
            cycleBreakdown={cycleBreakdown}
          />
          {footer}
        </>
      ) : (
        <>
          <WorkspaceExcessCreditsValueCard
            excessConsumedCredits={excessConsumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            isLoading={false}
          />
          <WorkspaceCreditPoolCycleHistoryTable
            cycleBreakdown={excessCycleBreakdown}
          />
          {footer}
        </>
      )}
    </Page.Vertical>
  );
}
