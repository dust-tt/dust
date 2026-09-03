import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import { ONE_DAY_MS } from "@app/lib/api/analytics/time_utils";
import { formatCredits } from "@app/lib/client/credits";
import {
  useAwuPoolCurrentCycle,
  useAwuPoolCycleHistory,
} from "@app/lib/swr/credits";
import type {
  AwuPoolCurrentCycleResponseBody,
  AwuPoolCycleBreakdown,
} from "@app/types/api/credits/awu_pool_summary";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  ContentMessage,
  cn,
  DataTable,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

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

interface WorkspaceCreditUsageValueCardsProps {
  showPoolCard: boolean;
  totalRemainingCredits: number;
  consumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  programmaticConsumedCredits: number | null;
  otherConsumedCredits: number | null;
  isLoading: boolean;
}

export function WorkspaceCreditUsageValueCards({
  showPoolCard,
  totalRemainingCredits,
  consumedCredits,
  currentCycleStartMs,
  currentCycleEndMs,
  programmaticConsumedCredits,
  otherConsumedCredits,
  isLoading,
}: WorkspaceCreditUsageValueCardsProps) {
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
        hint={`Other: ${
          otherConsumedCredits !== null
            ? formatCredits(otherConsumedCredits)
            : "—"
        }`}
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
  return (
    <>
      <Page.H variant="h5">Previous cycles</Page.H>
      <DataTable data={rows} columns={CYCLE_HISTORY_COLUMNS} />
    </>
  );
}

interface WorkspaceCreditPoolHistoryProps {
  tableStatus: CreditPoolFetchStatus;
  cycleBreakdown: AwuPoolCycleBreakdown[];
}

// Table area rendered under the value cards. Kept separate so a slow cycle
// history fetch never blocks the (fast) cards above it from showing.
function WorkspaceCreditPoolHistory({
  tableStatus,
  cycleBreakdown,
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
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      );
    case "ready":
      return (
        <WorkspaceCreditPoolCycleHistoryTable cycleBreakdown={cycleBreakdown} />
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
  otherConsumedCredits: number | null;
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
  otherConsumedCredits,
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
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          <WorkspaceCreditUsageValueCards
            showPoolCard={showPoolCard}
            totalRemainingCredits={totalRemainingCredits}
            consumedCredits={consumedCredits}
            currentCycleStartMs={currentCycleStartMs}
            currentCycleEndMs={currentCycleEndMs}
            programmaticConsumedCredits={programmaticConsumedCredits}
            otherConsumedCredits={otherConsumedCredits}
            isLoading={false}
          />
          <WorkspaceCreditPoolHistory
            tableStatus={tableStatus}
            cycleBreakdown={cycleBreakdown}
          />
        </>
      )}
    </Page.Vertical>
  );
}

interface CreditPoolCardsFromCycleDataProps {
  awuPoolCurrentCycle: AwuPoolCurrentCycleResponseBody | null;
  isAwuPoolCurrentCycleLoading: boolean;
  isAwuPoolCurrentCycleError: boolean;
  poolCycleBreakdown: AwuPoolCycleBreakdown[];
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  isAwuPoolCycleHistoryLoading: boolean;
  isAwuPoolCycleHistoryError: boolean;
}

// Turns a fetched current-cycle/cycle-history pair into the credit
// consumption cards. Shared by Poke's read-only pool view
// (front/components/poke/pages/PoolUsagePage.tsx) and the customer-facing
// compact usage page so the "showPoolCard vs. excess" logic below can't
// drift between the two — only the SWR hooks feeding it differ.
export function CreditPoolCardsFromCycleData({
  awuPoolCurrentCycle,
  isAwuPoolCurrentCycleLoading,
  isAwuPoolCurrentCycleError,
  poolCycleBreakdown,
  excessCycleBreakdown,
  isAwuPoolCycleHistoryLoading,
  isAwuPoolCycleHistoryError,
}: CreditPoolCardsFromCycleDataProps) {
  const {
    totalRemainingCredits,
    totalActiveCredits,
    currentCycleConsumedCredits,
    currentCycleStartMs,
    currentCycleEndMs,
    excessConsumedCredits,
    programmaticConsumedCredits,
    otherConsumedCredits,
  } = awuPoolCurrentCycle ?? {
    totalRemainingCredits: 0,
    totalActiveCredits: 0,
    currentCycleConsumedCredits: null,
    currentCycleStartMs: null,
    currentCycleEndMs: null,
    excessConsumedCredits: null,
    programmaticConsumedCredits: null,
    otherConsumedCredits: null,
  };

  const hasPool = totalActiveCredits > 0;
  const hasExcessData =
    excessConsumedCredits !== null || excessCycleBreakdown.length > 0;

  return (
    <WorkspaceCreditPoolSection
      cardsStatus={toCreditPoolFetchStatus(
        isAwuPoolCurrentCycleLoading,
        isAwuPoolCurrentCycleError
      )}
      tableStatus={toCreditPoolFetchStatus(
        isAwuPoolCycleHistoryLoading,
        isAwuPoolCycleHistoryError
      )}
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
      otherConsumedCredits={otherConsumedCredits}
    />
  );
}

interface CompactCreditPoolCardsProps {
  owner: LightWorkspaceType;
  disabled: boolean;
}

// Credit consumption cards for the compact usage page, backed by the
// customer-facing awu-pool-current-cycle/cycle-history routes.
export function CompactCreditPoolCards({
  owner,
  disabled,
}: CompactCreditPoolCardsProps) {
  const {
    awuPoolCurrentCycle,
    isAwuPoolCurrentCycleLoading,
    isAwuPoolCurrentCycleError,
  } = useAwuPoolCurrentCycle({ workspaceId: owner.sId, disabled });
  const {
    cycleBreakdown: poolCycleBreakdown,
    excessCycleBreakdown,
    isAwuPoolCycleHistoryLoading,
    isAwuPoolCycleHistoryError,
  } = useAwuPoolCycleHistory({ workspaceId: owner.sId, disabled });

  return (
    <CreditPoolCardsFromCycleData
      awuPoolCurrentCycle={awuPoolCurrentCycle}
      isAwuPoolCurrentCycleLoading={isAwuPoolCurrentCycleLoading}
      isAwuPoolCurrentCycleError={!!isAwuPoolCurrentCycleError}
      poolCycleBreakdown={poolCycleBreakdown}
      excessCycleBreakdown={excessCycleBreakdown}
      isAwuPoolCycleHistoryLoading={isAwuPoolCycleHistoryLoading}
      isAwuPoolCycleHistoryError={!!isAwuPoolCycleHistoryError}
    />
  );
}
