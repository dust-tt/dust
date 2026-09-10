import {
  SummaryCard,
  SummaryCardSkeleton,
} from "@app/components/workspace/analytics/SummaryCard";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import { MAX_CYCLE_HISTORY_LIMIT } from "@app/lib/credits/awu_purchase_constants";
import {
  useAwuPoolCurrentCycle,
  useAwuPoolCycleHistory,
} from "@app/lib/swr/credits";
import type {
  AwuPoolCurrentCycleResponseBody,
  AwuPoolCycleBreakdown,
} from "@app/types/api/credits/awu_pool_summary";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  ContentMessage,
  cn,
  DataTable,
  DataTableLoadingSkeleton,
  LoadingBlock,
  Page,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useState } from "react";

export type CreditPoolFetchStatus = "loading" | "error" | "ready";

export function toCreditPoolFetchStatus(
  isLoading: boolean,
  isError: boolean
): CreditPoolFetchStatus {
  if (isError) {
    return "error";
  }
  return isLoading ? "loading" : "ready";
}

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
    (currentCycleEndMs - currentCycleStartMs) / ONE_DAY_MS
  );
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, Math.ceil((Date.now() - currentCycleStartMs) / ONE_DAY_MS))
  );
  return `Day ${elapsedDays}/${totalDays}`;
}

function formatProgrammaticUsageShare(
  programmaticConsumedCredits: number | null,
  consumedCredits: number | null
): string | null {
  if (
    typeof programmaticConsumedCredits !== "number" ||
    typeof consumedCredits !== "number" ||
    consumedCredits <= 0
  ) {
    return null;
  }
  const percentage = Math.round(
    Math.min(100, (programmaticConsumedCredits / consumedCredits) * 100)
  );
  return `${percentage}% of the usage`;
}

interface WorkspaceCreditUsageValueCardsProps {
  showPoolCard: boolean;
  totalRemainingCredits: number;
  consumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  programmaticConsumedCredits: number | null;
  isLoading: boolean;
}

export function WorkspaceCreditUsageValueCards({
  showPoolCard,
  totalRemainingCredits,
  consumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  isLoading,
}: WorkspaceCreditUsageValueCardsProps) {
  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  const gridClassName = cn(
    "grid gap-4",
    showPoolCard ? "grid-cols-3" : "grid-cols-2"
  );

  if (isLoading) {
    return (
      <div
        aria-label="Loading credit consumption"
        className={gridClassName}
        role="status"
      >
        {showPoolCard && <SummaryCardSkeleton />}
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
      </div>
    );
  }

  return (
    <div className={gridClassName}>
      {showPoolCard && (
        <SummaryCard
          label="Remaining credits in the pool"
          value={formatCredits(totalRemainingCredits)}
          hint={null}
        />
      )}
      <SummaryCard
        label="Used this cycle"
        value={
          typeof consumedCredits === "number"
            ? formatCredits(consumedCredits)
            : "—"
        }
        hint={cycleDayLabel}
      />
      <SummaryCard
        label="Programmatic usage this cycle"
        value={
          typeof programmaticConsumedCredits === "number"
            ? formatCredits(programmaticConsumedCredits)
            : "—"
        }
        hint={formatProgrammaticUsageShare(
          programmaticConsumedCredits,
          consumedCredits
        )}
      />
    </div>
  );
}

// Travels untouched from the data hooks down to the table.
export interface CycleHistoryLoadMore {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

interface WorkspaceCreditPoolCycleHistoryTableProps {
  cycleBreakdown: AwuPoolCycleBreakdown[];
  cycleHistoryLoadMore: CycleHistoryLoadMore;
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
    header: "Used credits",
    enableSorting: false,
    meta: { headerAlign: "right" },
    cell: ({ row }) => (
      <span className="block text-right text-sm">
        {row.original.consumedCredits}
      </span>
    ),
  },
];

export const INITIAL_CYCLE_HISTORY_ROW_COUNT = 2;
export const CYCLE_HISTORY_LOAD_MORE_COUNT = 5;

export function WorkspaceCreditPoolCycleHistoryTable({
  cycleBreakdown,
  cycleHistoryLoadMore,
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

  return (
    <>
      <Page.H variant="h5">Previous cycles</Page.H>
      <DataTable
        data={rows}
        columns={CYCLE_HISTORY_COLUMNS}
        // The true total is unknown while more cycles remain; once everything
        // is loaded, the total lets the footer hide its control.
        totalRowCount={
          cycleHistoryLoadMore.hasMore ? undefined : cycleBreakdown.length
        }
        onLoadMore={cycleHistoryLoadMore.onLoadMore}
        isLoadingMore={cycleHistoryLoadMore.isLoading}
      />
    </>
  );
}

interface WorkspaceCreditPoolHistoryProps {
  tableStatus: CreditPoolFetchStatus;
  cycleBreakdown: AwuPoolCycleBreakdown[];
  cycleHistoryLoadMore: CycleHistoryLoadMore;
}

// Table area rendered under the value cards. Kept separate so a slow cycle
// history fetch never blocks the (fast) cards above it from showing.
function WorkspaceCreditPoolHistory({
  tableStatus,
  cycleBreakdown,
  cycleHistoryLoadMore,
}: WorkspaceCreditPoolHistoryProps) {
  switch (tableStatus) {
    case "error":
      return (
        <ContentMessage
          title="Failed to load cycle history"
          icon={AlertCircle}
          variant="warning"
        >
          An error occurred while loading past-cycle consumption.
        </ContentMessage>
      );
    case "loading":
      return (
        <div
          aria-label="Loading previous cycles"
          className="flex flex-col gap-2"
          role="status"
        >
          <LoadingBlock className="h-5 w-32" />
          <DataTableLoadingSkeleton
            rows={INITIAL_CYCLE_HISTORY_ROW_COUNT}
            showSelectionColumn={false}
          />
        </div>
      );
    case "ready":
      return (
        <WorkspaceCreditPoolCycleHistoryTable
          cycleBreakdown={cycleBreakdown}
          cycleHistoryLoadMore={cycleHistoryLoadMore}
        />
      );
    default:
      assertNeverAndIgnore(tableStatus);
      return null;
  }
}

interface WorkspaceCreditPoolSectionProps {
  cardsStatus: CreditPoolFetchStatus;
  tableStatus: CreditPoolFetchStatus;
  showPoolCard: boolean;
  isVisible: boolean;
  totalRemainingCredits: number;
  consumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  cycleBreakdown: AwuPoolCycleBreakdown[];
  programmaticConsumedCredits: number | null;
  cycleHistoryLoadMore: CycleHistoryLoadMore;
}

export function WorkspaceCreditPoolSection({
  cardsStatus,
  tableStatus,
  showPoolCard,
  isVisible,
  totalRemainingCredits,
  consumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  cycleBreakdown,
  programmaticConsumedCredits,
  cycleHistoryLoadMore,
}: WorkspaceCreditPoolSectionProps) {
  if (cardsStatus === "ready" && !isVisible) {
    return null;
  }

  return (
    <Page.Vertical gap="xs" align="stretch">
      <Page.H variant="h4">Credit consumption</Page.H>

      {cardsStatus === "error" ? (
        <ContentMessage
          title="Failed to load Workspace Credits Pool"
          icon={AlertCircle}
          variant="warning"
        >
          An error occurred while loading the workspace&apos;s credit pool data.
        </ContentMessage>
      ) : cardsStatus === "loading" ? (
        // Whether the workspace has a pool is unknown until the data lands, so
        // the placeholder assumes the fuller layout.
        <WorkspaceCreditUsageValueCards
          showPoolCard
          totalRemainingCredits={0}
          consumedCredits={null}
          currentCycleStartMs={null}
          currentCycleEndMs={null}
          programmaticConsumedCredits={null}
          isLoading
        />
      ) : (
        <>
          <WorkspaceCreditUsageValueCards
            showPoolCard={showPoolCard}
            totalRemainingCredits={totalRemainingCredits}
            consumedCredits={consumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            isLoading={false}
          />
          <WorkspaceCreditPoolHistory
            tableStatus={tableStatus}
            cycleBreakdown={cycleBreakdown}
            cycleHistoryLoadMore={cycleHistoryLoadMore}
          />
        </>
      )}
    </Page.Vertical>
  );
}

// Reveals cycle history a page at a time, re-fetching a growing
// `cycleHistoryLimit` from the backend rather than paginating client-side,
// since the backend itself caps how many cycles it will ever return
// (`MAX_CYCLE_HISTORY_LIMIT`).
export function useCycleHistoryLimit() {
  const [cycleHistoryLimit, setCycleHistoryLimit] = useState(
    INITIAL_CYCLE_HISTORY_ROW_COUNT
  );

  const onLoadMoreCycleHistory = useCallback(() => {
    setCycleHistoryLimit((limit) =>
      Math.min(MAX_CYCLE_HISTORY_LIMIT, limit + CYCLE_HISTORY_LOAD_MORE_COUNT)
    );
  }, []);

  return { cycleHistoryLimit, onLoadMoreCycleHistory };
}

interface CreditPoolCardsFromCycleDataProps {
  awuPoolCurrentCycle: AwuPoolCurrentCycleResponseBody | null;
  cardsStatus: CreditPoolFetchStatus;
  poolCycleBreakdown: AwuPoolCycleBreakdown[];
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  tableStatus: CreditPoolFetchStatus;
  cycleHistoryLoadMore: CycleHistoryLoadMore;
}
export function CreditPoolCardsFromCycleData({
  awuPoolCurrentCycle,
  cardsStatus,
  poolCycleBreakdown,
  excessCycleBreakdown,
  tableStatus,
  cycleHistoryLoadMore,
}: CreditPoolCardsFromCycleDataProps) {
  const {
    totalRemainingCredits,
    totalActiveCredits,
    currentCycleConsumedCredits,
    currentCycleStartMs,
    currentCycleEndMs,
    excessConsumedCredits,
    programmaticConsumedCredits,
  } = awuPoolCurrentCycle ?? {
    totalRemainingCredits: 0,
    totalActiveCredits: 0,
    currentCycleConsumedCredits: null,
    currentCycleStartMs: null,
    currentCycleEndMs: null,
    excessConsumedCredits: null,
    programmaticConsumedCredits: null,
  };

  const hasPool = totalActiveCredits > 0;
  const hasExcessData =
    excessConsumedCredits !== null || excessCycleBreakdown.length > 0;

  return (
    <WorkspaceCreditPoolSection
      cardsStatus={cardsStatus}
      tableStatus={tableStatus}
      showPoolCard={hasPool}
      isVisible={hasPool || hasExcessData}
      totalRemainingCredits={totalRemainingCredits}
      consumedCredits={
        hasPool ? currentCycleConsumedCredits : excessConsumedCredits
      }
      currentCycleStartMs={currentCycleStartMs}
      currentCycleEndMs={currentCycleEndMs}
      cycleBreakdown={hasPool ? poolCycleBreakdown : excessCycleBreakdown}
      programmaticConsumedCredits={programmaticConsumedCredits}
      cycleHistoryLoadMore={cycleHistoryLoadMore}
    />
  );
}

interface CreditPoolCardsProps {
  owner: LightWorkspaceType;
  disabled: boolean;
}
export function CreditPoolCards({ owner, disabled }: CreditPoolCardsProps) {
  const { cycleHistoryLimit, onLoadMoreCycleHistory } = useCycleHistoryLimit();
  const {
    awuPoolCurrentCycle,
    isAwuPoolCurrentCycleLoading,
    isAwuPoolCurrentCycleError,
  } = useAwuPoolCurrentCycle({ workspaceId: owner.sId, disabled });
  const {
    cycleBreakdown: poolCycleBreakdown,
    excessCycleBreakdown,
    hasMoreCycleHistory,
    isAwuPoolCycleHistoryLoading,
    isAwuPoolCycleHistoryError,
    isAwuPoolCycleHistoryValidating,
  } = useAwuPoolCycleHistory({
    workspaceId: owner.sId,
    cycleHistoryLimit,
    disabled,
  });

  return (
    <CreditPoolCardsFromCycleData
      awuPoolCurrentCycle={awuPoolCurrentCycle}
      cardsStatus={toCreditPoolFetchStatus(
        isAwuPoolCurrentCycleLoading,
        !!isAwuPoolCurrentCycleError
      )}
      poolCycleBreakdown={poolCycleBreakdown}
      excessCycleBreakdown={excessCycleBreakdown}
      tableStatus={toCreditPoolFetchStatus(
        isAwuPoolCycleHistoryLoading,
        !!isAwuPoolCycleHistoryError
      )}
      cycleHistoryLoadMore={{
        hasMore: hasMoreCycleHistory,
        isLoading:
          isAwuPoolCycleHistoryValidating && !isAwuPoolCycleHistoryLoading,
        onLoadMore: onLoadMoreCycleHistory,
      }}
    />
  );
}
