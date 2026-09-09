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
        hint={formatProgrammaticUsageShare(
          programmaticConsumedCredits,
          consumedCredits
        )}
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
  cardsStatus: CreditPoolFetchStatus;
  poolCycleBreakdown: AwuPoolCycleBreakdown[];
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  tableStatus: CreditPoolFetchStatus;
}
export function CreditPoolCardsFromCycleData({
  awuPoolCurrentCycle,
  cardsStatus,
  poolCycleBreakdown,
  excessCycleBreakdown,
  tableStatus,
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
    />
  );
}

interface CreditPoolCardsProps {
  owner: LightWorkspaceType;
  disabled: boolean;
}
export function CreditPoolCards({ owner, disabled }: CreditPoolCardsProps) {
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
    />
  );
}
