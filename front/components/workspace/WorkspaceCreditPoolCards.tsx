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

interface WorkspaceCreditPoolSectionProps {
  isLoading: boolean;
  isError: boolean;
  // Whether to render the "Workspace credit pool" branch (value cards +
  // pool cycle history) or the "Excess credit consumption" branch — kept as
  // an explicit flag rather than derived internally so callers with their
  // own pool-eligibility rules (e.g. a read-only legacy-contract mode) don't
  // have to leak that logic into this shared component.
  showPoolBranch: boolean;
  // Whether the section should render at all once loading/error have
  // resolved — false collapses it entirely (e.g. no pool and no excess data
  // to show).
  visible: boolean;
  totalRemainingCredits: number;
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  cycleBreakdown: AwuPoolCycleBreakdown[];
  excessConsumedCredits: number | null;
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  // Rendered under the value cards, pool branch only — each caller's own mix
  // of overage/expiration/contract-type text.
  poolSecondaryContent?: ReactNode;
  // Rendered under the cycle history table in both branches.
  footer?: ReactNode;
}

// Single source of truth for the "Workspace credit pool" / "Excess credit
// consumption" block so the customer-facing usage page and its Poke mirror
// can't drift from each other on this section's structure — only the
// page-specific secondary text and footer differ, via slots.
export function WorkspaceCreditPoolSection({
  isLoading,
  isError,
  showPoolBranch,
  visible,
  totalRemainingCredits,
  currentCycleConsumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  cycleBreakdown,
  excessConsumedCredits,
  excessCycleBreakdown,
  poolSecondaryContent,
  footer,
}: WorkspaceCreditPoolSectionProps) {
  if (!isLoading && !isError && !visible) {
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
