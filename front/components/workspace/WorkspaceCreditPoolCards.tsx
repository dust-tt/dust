import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import type { TableSkeletonCellProps } from "@app/components/workspace/TableSkeleton";
import { TableSkeleton } from "@app/components/workspace/TableSkeleton";
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
  AwuPoolCycleHistoryOverflow,
} from "@app/types/api/credits/awu_pool_summary";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  ContentMessage,
  cn,
  DataTable,
  LoadingBlock,
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
  isRefreshing: boolean;
}

export function WorkspaceCreditUsageValueCards({
  showPoolCard,
  totalRemainingCredits,
  consumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  isLoading,
  isRefreshing,
}: WorkspaceCreditUsageValueCardsProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "grid gap-4",
          showPoolCard ? "grid-cols-3" : "grid-cols-2"
        )}
      >
        {Array.from({ length: showPoolCard ? 3 : 2 }, (_, index) => (
          <LoadingBlock key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const cycleDayLabel = formatCycleDayLabel(
    currentCycleStartMs,
    currentCycleEndMs
  );
  return (
    <div
      className={cn("grid gap-4", showPoolCard ? "grid-cols-3" : "grid-cols-2")}
    >
      {showPoolCard && (
        <SummaryCard
          label="Remaining credits in the pool"
          value={formatCredits(totalRemainingCredits)}
          hint={null}
          isRefreshing={isRefreshing}
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
        isRefreshing={isRefreshing}
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
        isRefreshing={isRefreshing}
      />
    </div>
  );
}

// Travels untouched from the data hooks down to the table.
export interface CycleHistoryLoadMore {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  // Absent while only the initial rows are shown.
  onShowLess?: () => void;
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

function CycleHistorySkeletonCell({ columnId }: TableSkeletonCellProps) {
  switch (columnId) {
    case "cycle":
      return <LoadingBlock className="h-3 w-56 max-w-full" />;
    case "consumedCredits":
      return <LoadingBlock className="ml-auto h-3 w-16" />;
    default:
      return null;
  }
}

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
      <DataTable
        data={rows}
        columns={CYCLE_HISTORY_COLUMNS}
        // The true total is unknown while more cycles remain; once everything
        // is loaded, the total lets the footer hide its control.
        totalRowCount={
          cycleHistoryLoadMore.hasMore ? undefined : cycleBreakdown.length
        }
        onLoadMore={cycleHistoryLoadMore.onLoadMore}
        onShowLess={cycleHistoryLoadMore.onShowLess}
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
        <div className="flex flex-col gap-2">
          <TableSkeleton
            columns={CYCLE_HISTORY_COLUMNS}
            SkeletonCell={CycleHistorySkeletonCell}
            rowCount={INITIAL_CYCLE_HISTORY_ROW_COUNT}
          />
          <div className="flex h-6 items-center justify-between px-1">
            <LoadingBlock className="h-3 w-16" />
            <LoadingBlock className="h-3 w-14" />
          </div>
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
  // Background refresh of already displayed cards (e.g. right after a purchase).
  isCardsRefreshing: boolean;
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
  isCardsRefreshing,
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
    <div className="flex flex-col items-stretch gap-10">
      {cardsStatus === "error" ? (
        <ContentMessage
          title="Failed to load Workspace Credits Pool"
          icon={AlertCircle}
          variant="warning"
        >
          An error occurred while loading the workspace&apos;s credit pool data.
        </ContentMessage>
      ) : (
        <>
          <WorkspaceCreditUsageValueCards
            showPoolCard={showPoolCard}
            totalRemainingCredits={totalRemainingCredits}
            consumedCredits={consumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            isLoading={cardsStatus === "loading"}
            isRefreshing={isCardsRefreshing}
          />
          <WorkspaceCreditPoolHistory
            tableStatus={cardsStatus === "loading" ? "loading" : tableStatus}
            cycleBreakdown={cycleBreakdown}
            cycleHistoryLoadMore={cycleHistoryLoadMore}
          />
        </>
      )}
    </div>
  );
}

// Reveals cycle history a page at a time, re-fetching a growing
// `cycleHistoryLimit` from the backend rather than paginating client-side,
// since the backend itself caps how many cycles it will ever return
// (`MAX_CYCLE_HISTORY_LIMIT`). The limit counts cycles with consumption, so
// each step reveals a full page of rows whenever that many exist.
export function useCycleHistoryLimit() {
  const [cycleHistoryLimit, setCycleHistoryLimit] = useState(
    INITIAL_CYCLE_HISTORY_ROW_COUNT
  );

  const onLoadMoreCycleHistory = useCallback(() => {
    setCycleHistoryLimit((limit) =>
      Math.min(MAX_CYCLE_HISTORY_LIMIT, limit + CYCLE_HISTORY_LOAD_MORE_COUNT)
    );
  }, []);

  const onShowLessCycleHistory = useCallback(() => {
    setCycleHistoryLimit(INITIAL_CYCLE_HISTORY_ROW_COUNT);
  }, []);

  return {
    cycleHistoryLimit,
    onLoadMoreCycleHistory,
    // Collapsing back is only offered once extra rows have been revealed.
    onShowLessCycleHistory:
      cycleHistoryLimit > INITIAL_CYCLE_HISTORY_ROW_COUNT
        ? onShowLessCycleHistory
        : undefined,
  };
}

// The backend tracks "more history" separately per breakdown since only one of the two is ever
// rendered for a given workspace (see `hasPool` below); resolving `hasMore` happens here, once
// that choice is made, rather than upstream where it isn't known yet.
export type CycleHistoryLoadMoreByBreakdown = Omit<
  CycleHistoryLoadMore,
  "hasMore"
> & {
  hasMoreCycleHistory: AwuPoolCycleHistoryOverflow;
};

interface CreditPoolCardsFromCycleDataProps {
  awuPoolCurrentCycle: AwuPoolCurrentCycleResponseBody | null;
  cardsStatus: CreditPoolFetchStatus;
  isCardsRefreshing?: boolean;
  poolCycleBreakdown: AwuPoolCycleBreakdown[];
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  tableStatus: CreditPoolFetchStatus;
  cycleHistoryLoadMore: CycleHistoryLoadMoreByBreakdown;
}
export function CreditPoolCardsFromCycleData({
  awuPoolCurrentCycle,
  cardsStatus,
  isCardsRefreshing = false,
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

  const { hasMoreCycleHistory, ...restCycleHistoryLoadMore } =
    cycleHistoryLoadMore;

  return (
    <WorkspaceCreditPoolSection
      cardsStatus={cardsStatus}
      isCardsRefreshing={isCardsRefreshing}
      tableStatus={tableStatus}
      // Reserve the three-card layout until the pool response is available.
      showPoolCard={
        hasPool || (cardsStatus === "loading" && !awuPoolCurrentCycle)
      }
      isVisible={hasPool || hasExcessData}
      totalRemainingCredits={totalRemainingCredits}
      consumedCredits={
        hasPool ? currentCycleConsumedCredits : excessConsumedCredits
      }
      currentCycleStartMs={currentCycleStartMs}
      currentCycleEndMs={currentCycleEndMs}
      cycleBreakdown={hasPool ? poolCycleBreakdown : excessCycleBreakdown}
      programmaticConsumedCredits={programmaticConsumedCredits}
      cycleHistoryLoadMore={{
        ...restCycleHistoryLoadMore,
        hasMore: hasPool
          ? hasMoreCycleHistory.cycleBreakdown
          : hasMoreCycleHistory.excessCycleBreakdown,
      }}
    />
  );
}

interface CreditPoolCardsProps {
  owner: LightWorkspaceType;
  disabled: boolean;
}
export function CreditPoolCards({ owner, disabled }: CreditPoolCardsProps) {
  const { cycleHistoryLimit, onLoadMoreCycleHistory, onShowLessCycleHistory } =
    useCycleHistoryLimit();
  const {
    awuPoolCurrentCycle,
    isAwuPoolCurrentCycleLoading,
    isAwuPoolCurrentCycleError,
    isAwuPoolCurrentCycleValidating,
  } = useAwuPoolCurrentCycle({ workspaceId: owner.sId, disabled });
  const {
    cycleBreakdown: poolCycleBreakdown,
    excessCycleBreakdown,
    hasMoreCycleHistoryByBreakdown: hasMoreCycleHistory,
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
      isCardsRefreshing={
        isAwuPoolCurrentCycleValidating && !isAwuPoolCurrentCycleLoading
      }
      poolCycleBreakdown={poolCycleBreakdown}
      excessCycleBreakdown={excessCycleBreakdown}
      tableStatus={toCreditPoolFetchStatus(
        isAwuPoolCycleHistoryLoading,
        !!isAwuPoolCycleHistoryError
      )}
      cycleHistoryLoadMore={{
        hasMoreCycleHistory,
        isLoading:
          isAwuPoolCycleHistoryValidating && !isAwuPoolCycleHistoryLoading,
        onLoadMore: onLoadMoreCycleHistory,
        onShowLess: onShowLessCycleHistory,
      }}
    />
  );
}
