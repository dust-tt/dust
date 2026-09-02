import {
  SEAT_TYPE_ICONS,
  seatTypeDisplayName,
} from "@app/components/workspace/billing/seatTypeUtils";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import {
  getSeatBarClasses,
  getSeatIconColorClass,
  MUTED_BAR_CLASSES,
  OVERAGE_BAR_CLASSES,
} from "@app/components/workspace/seat_styles";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import type { UserModelTierSelection } from "@app/lib/client/model_tier_options";
import {
  getUserModelTierMenuItemsWithSelection,
  INHERIT_MODEL_TIER,
  toUserModelTierSelection,
} from "@app/lib/client/model_tier_options";
import {
  formatModelTiersSummary,
  formatUserModelTierInheritLabel,
  resolveModelTiersForUser,
} from "@app/lib/client/model_tiers";
import type { ModelsTierDefinition } from "@app/lib/model_tiers/allowed_tiers";
import { getMaxTierName } from "@app/lib/model_tiers/tier_order";
import type { EffectiveSpendLimitSource } from "@app/lib/spend_limits/effective";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { getModelsTierDisplayName } from "@app/types/assistant/models/model_tiers";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  isPaidSeatType,
  SEAT_TYPE_ORDER,
  toBaseSeatType,
} from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Clock,
  cn,
  createSelectionColumn,
  DataTable,
  Icon,
  LoadingBlock,
  ProgressBar,
  ProgressRing,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

const EMPTY_USER_MODEL_TIER_SELECTION_BY_USER_ID: Record<
  string,
  UserModelTierSelection
> = {};
const EMPTY_USER_ALLOWED_MODEL_TIERS_BY_USER_ID: Record<
  string,
  ModelsTierName[]
> = {};
const EMPTY_GROUP_MODEL_TIERS_BY_GROUP_ID: Record<string, ModelsTierName[]> =
  {};
const EMPTY_WORKSPACE_ALLOWED_MODEL_TIERS: ModelsTierName[] = [];
const EMPTY_GROUP_NAME_TO_ID = new Map<string, string>();
const EMPTY_MODEL_TIER_DEFINITION_BY_NAME = new Map<
  ModelsTierName,
  ModelsTierDefinition
>();

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  groups: string[];
  seatType: MembershipSeatType | null;
  memberUsageLimit: number | null;
  seatBalanceAwu: number | null;
  consumedAwuCredits: number;
  consumedFromAllowanceAwuCredits: number;
  consumedFromPoolAwuCredits: number;
  seatUsageTarget: CreditUsageTarget | null;
  spendLimitAwuCredits: number | null;
  spendLimitSource: EffectiveSpendLimitSource;
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  isTotalAllowedUsagePending: boolean;
  isSeatChangePending: boolean;
  modelTiersSummary: string;
  hasUserLevelModelTiersOverride: boolean;
  menuItems: MenuItem[];
};

type Info = CellContext<RowData, string>;

// Builds the tooltip explaining a scheduled seat change, e.g.
// "This user will be downgraded to Free at the end of the billing period (July 1)".
function getScheduledSeatChangeLabel(
  currentSeatType: MembershipSeatType | null,
  scheduledSeatType: MembershipSeatType,
  scheduledSeatChangeAt: string | null
): string {
  const dateSuffix = scheduledSeatChangeAt
    ? ` (${new Date(scheduledSeatChangeAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })})`
    : "";

  // A same-tier monthly→yearly commitment (e.g. pro -> pro_yearly) isn't a
  // tier upgrade/downgrade/change — the user stays on the same tier, only the
  // billing cadence switches. Call that out explicitly instead of the
  // confusing "changed to Pro" wording, since the user is already on Pro.
  const isMonthlyToYearlySwitch =
    !!currentSeatType &&
    isPaidSeatType(currentSeatType) &&
    !currentSeatType.endsWith("_yearly") &&
    scheduledSeatType.endsWith("_yearly") &&
    toBaseSeatType(currentSeatType) === toBaseSeatType(scheduledSeatType);
  if (isMonthlyToYearlySwitch) {
    return `This user will switch to annual billing at the end of the billing period${dateSuffix}`;
  }

  const currentRank = currentSeatType ? SEAT_TYPE_ORDER[currentSeatType] : 0;
  const scheduledRank = SEAT_TYPE_ORDER[scheduledSeatType];
  const verb =
    scheduledRank > currentRank
      ? "upgraded"
      : scheduledRank < currentRank
        ? "downgraded"
        : "changed";
  const targetLabel = seatTypeDisplayName(scheduledSeatType);
  return `This user will be ${verb} to ${targetLabel} at the end of the billing period${dateSuffix}`;
}

interface SeatTypeIconProps {
  seatType: MembershipSeatType | null;
}

function SeatTypeIcon({ seatType }: SeatTypeIconProps) {
  if (!seatType) {
    return null;
  }
  const displaySeatType = toBaseSeatType(seatType);
  const visual = SEAT_TYPE_ICONS[displaySeatType];
  if (!visual) {
    return null;
  }
  return (
    <Icon
      visual={visual}
      size="sm"
      className={getSeatIconColorClass(displaySeatType)}
    />
  );
}

interface AwuUsageBarProps {
  consumed: number;
  // Of `consumed`, the part drawn from the seat allowance vs. the workspace
  // pool (+ overage). Provided by the API so the bar doesn't re-derive the
  // split. `consumedFromAllowance + consumedFromPool === consumed`.
  consumedFromAllowance: number;
  consumedFromPool: number;
  memberUsageLimit: number | null;
  // Live remaining Metronome balance for the per-user credit (free seats only).
  // When provided for a free seat, the bar shows lifetime consumed/remaining
  // instead of period spend.
  seatBalanceAwu?: number | null;
  // The fully-resolved spend cap from `spendLimitAwuCredits` (member override,
  // group cap or workspace default, all including seat allowance). Always
  // non-null for seated users — workspace default pool cap treats null as 0
  // (seat-only). Pass `?? 0` as a TypeScript guard only.
  effectiveLimit: number;
  // Where `effectiveLimit` comes from — shown as a tooltip on the limit figure.
  spendLimitSource: EffectiveSpendLimitSource;
  seatType: MembershipSeatType | null;
  isTotalAllowedUsagePending: boolean;
}

// Human-readable origin of the effective spend limit, or null when there is
// nothing worth explaining (no limit configured).
function spendLimitSourceLabel(
  source: EffectiveSpendLimitSource
): string | null {
  switch (source) {
    case "override":
      return "Limit set specifically for this member";
    case "group":
      return "Limit from a group";
    case "default":
      return "Workspace default limit";
    case "none":
      return null;
    default:
      assertNeverAndIgnore(source);
      return null;
  }
}

export function AwuUsageBar({
  consumed,
  consumedFromAllowance,
  consumedFromPool,
  memberUsageLimit,
  seatBalanceAwu,
  effectiveLimit,
  spendLimitSource,
  seatType,
  isTotalAllowedUsagePending: isPending,
}: AwuUsageBarProps) {
  const seatColors = getSeatBarClasses(seatType);
  const allowance = memberUsageLimit ?? 0;
  const sourceLabel = spendLimitSourceLabel(spendLimitSource);
  // For free seats: use lifetime consumed (derived from the live Metronome
  // balance) instead of period spend, so the bar reflects remaining credit.
  const isFreeWithBalance =
    seatType === "free" &&
    typeof seatBalanceAwu === "number" &&
    typeof memberUsageLimit === "number";
  const lifetimeConsumed = isFreeWithBalance
    ? Math.max(0, memberUsageLimit - seatBalanceAwu!)
    : null;
  // Uncapped is not a real product state: fall back to seat allowance when no
  // explicit spend limit is configured (no pool access).
  // The bar splits consumption into seat → pool → overage:
  //   seat consumed · seat remaining · pool consumed · pool remaining · overage
  // `poolLimit` is the headroom above the seat allowance (0 = seat-only, e.g. free).
  // A seat with no pool (poolLimit === 0) shows no pool section —
  // any spend beyond the seat allowance is overage. Zero-width sections are
  // skipped. `pool remaining` is omitted when uncapped (no finite headroom).
  const seatConsumed = isFreeWithBalance
    ? lifetimeConsumed!
    : consumedFromAllowance;
  const seatRemaining = isFreeWithBalance
    ? seatBalanceAwu!
    : Math.max(0, allowance - seatConsumed);
  const poolLimit =
    effectiveLimit !== null ? Math.max(0, effectiveLimit - allowance) : null;
  // Of the pool consumption, the part within the pool limit vs. the overage
  // beyond it (only capped seats can have overage).
  const poolConsumed =
    poolLimit !== null
      ? Math.min(consumedFromPool, poolLimit)
      : consumedFromPool;
  const poolRemaining =
    poolLimit !== null ? Math.max(0, poolLimit - poolConsumed) : null;
  const overage =
    poolLimit !== null ? Math.max(0, consumedFromPool - poolLimit) : 0;

  const sections: Array<{
    value: number;
    className: string;
    label: string;
  }> = [];
  const creditLabel = isFreeWithBalance ? "lifetime credits" : "seat allowance";
  if (seatConsumed > 0) {
    sections.push({
      value: seatConsumed,
      className: seatColors.fill,
      label: `${formatCredits(seatConsumed)} of ${formatCredits(allowance)} ${creditLabel} used`,
    });
  }
  if (seatRemaining > 0) {
    sections.push({
      value: seatRemaining,
      className: seatColors.track,
      label: `${formatCredits(seatRemaining)} of ${formatCredits(allowance)} ${creditLabel} remaining`,
    });
  }
  if (poolConsumed > 0) {
    sections.push({
      value: poolConsumed,
      className: MUTED_BAR_CLASSES.fill,
      label: `${formatCredits(poolConsumed)} credits used from the workspace pool`,
    });
  }
  if (poolRemaining !== null && poolRemaining > 0) {
    sections.push({
      value: poolRemaining,
      className: MUTED_BAR_CLASSES.track,
      label: `${formatCredits(poolRemaining)} credits remaining before spend limit`,
    });
  }
  // Overage is surfaced in the tooltip only, not as a bar segment.

  const total = sections.reduce((sum, s) => sum + s.value, 0);
  const usedPercentage =
    total > 0
      ? Math.min(
          100,
          Math.max(0, ((seatConsumed + poolConsumed) / total) * 100)
        )
      : 0;

  const hasSeatSections = seatConsumed > 0 || seatRemaining > 0;
  // Only surface the pool when there's actually a pool to spend from: a finite
  // positive limit, or uncapped (null). A zero pool limit (free) has no pool.
  const hasPoolSections =
    (poolLimit === null || poolLimit > 0) &&
    (poolConsumed > 0 || (poolRemaining !== null && poolRemaining > 0));

  const tooltipLines: Array<{
    track: string;
    fill: string;
    legend: string;
    usage: string;
  }> = [];
  if (hasSeatSections) {
    tooltipLines.push({
      track: seatColors.track,
      fill: seatColors.fill,
      legend: isFreeWithBalance ? "Lifetime credits" : "Seat usage",
      usage: `${formatCredits(seatConsumed)} credits used out of ${formatCredits(allowance)}`,
    });
  }
  if (hasPoolSections) {
    tooltipLines.push({
      track: MUTED_BAR_CLASSES.track,
      fill: MUTED_BAR_CLASSES.fill,
      legend: "Pool usage",
      usage:
        poolLimit !== null
          ? `${formatCredits(poolConsumed)} credits used out of ${formatCredits(poolLimit)}`
          : `${formatCredits(poolConsumed)} credits used`,
    });
  }
  if (overage > 0) {
    tooltipLines.push({
      track: OVERAGE_BAR_CLASSES.track,
      fill: OVERAGE_BAR_CLASSES.fill,
      legend: "Overage",
      usage: `${formatCredits(overage)} credits over the spend limit`,
    });
  }

  const tooltipContent =
    tooltipLines.length > 0 ? (
      <div className="flex flex-col gap-1">
        {tooltipLines.map((line) => (
          <div key={line.legend} className="flex items-center gap-2">
            <div className="relative h-2.5 w-2.5 overflow-hidden rounded-sm">
              <div
                className={`absolute inset-0 ${line.track}`}
                style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
              />
              <div
                className={`absolute inset-0 ${line.fill}`}
                style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
              />
            </div>
            <span>
              {line.legend} — {line.usage}
            </span>
          </div>
        ))}
      </div>
    ) : null;

  const bar = (
    <div className="flex h-3 w-full items-center">
      <ProgressBar
        aria-label="Member credit usage"
        aria-valuenow={usedPercentage}
        aria-valuetext={
          sections.length > 0
            ? sections.map((section) => section.label).join(", ")
            : "No credits available"
        }
        className="h-1 w-full gap-px bg-transparent"
        values={
          sections.length > 0
            ? sections.map(({ value, className }) => ({ value, className }))
            : [{ value: 1, className: MUTED_BAR_CLASSES.track }]
        }
      />
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground">
        <span>
          {isFreeWithBalance
            ? formatCredits(Math.min(lifetimeConsumed! + overage, allowance))
            : formatCredits(
                effectiveLimit !== null
                  ? Math.min(consumed, effectiveLimit)
                  : consumed
              )}
        </span>
        {isPending ? (
          <Spinner size="xs" />
        ) : isFreeWithBalance ? (
          <span>{formatCredits(allowance)}</span>
        ) : sourceLabel !== null ? (
          <Tooltip
            tooltipTriggerAsChild
            label={sourceLabel}
            trigger={<span>{formatCredits(effectiveLimit)}</span>}
          />
        ) : (
          <span>{formatCredits(effectiveLimit)}</span>
        )}
      </div>
      {tooltipContent ? (
        <Tooltip tooltipTriggerAsChild label={tooltipContent} trigger={bar} />
      ) : (
        bar
      )}
    </div>
  );
}

const nameColumn = buildMemberNameColumn<RowData>();

const groupsColumn: ColumnDef<RowData, string> = {
  id: "groups" as const,
  header: "Groups",
  enableSorting: false,
  accessorFn: (row) => row.groups.join(", "),
  cell: (info: Info) => {
    const { groups } = info.row.original;
    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground">
          {groups.length > 0 ? groups.join(", ") : "--"}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-48",
  },
};

const seatTypeColumn: ColumnDef<RowData, string> = {
  id: "seatType" as const,
  header: "Seat",
  enableSorting: false,
  accessorFn: (row) => row.seatType ?? "",
  cell: (info: Info) => {
    if (info.row.original.isSeatChangePending) {
      return (
        <DataTable.CellContent>
          <Spinner size="xs" />
        </DataTable.CellContent>
      );
    }
    const seatType = info.row.original.seatType;
    const scheduledSeatType = info.row.original.scheduledSeatType;
    const scheduledSeatChangeAt = info.row.original.scheduledSeatChangeAt;
    return (
      <DataTable.CellContent>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <SeatTypeIcon seatType={seatType} />
          {seatType ? seatTypeDisplayName(seatType) : seatType}
          {scheduledSeatType && (
            <Tooltip
              label={getScheduledSeatChangeLabel(
                seatType,
                scheduledSeatType,
                scheduledSeatChangeAt
              )}
              tooltipTriggerAsChild
              trigger={
                <span className="cursor-default">
                  <Icon visual={Clock} size="xs" />
                </span>
              }
            />
          )}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-36",
  },
};

const seatsIconColumn: ColumnDef<RowData, string> = {
  id: "seatsIcon" as const,
  header: "Seats",
  enableSorting: false,
  accessorFn: (row) => row.seatType ?? "",
  cell: (info: Info) => {
    if (info.row.original.isSeatChangePending) {
      return (
        <DataTable.CellContent className="justify-center">
          <Spinner size="xs" />
        </DataTable.CellContent>
      );
    }
    const { seatType, scheduledSeatType, scheduledSeatChangeAt } =
      info.row.original;
    if (!seatType) {
      return (
        <DataTable.CellContent className="justify-center">
          <span className="text-sm text-muted-foreground">--</span>
        </DataTable.CellContent>
      );
    }
    const tooltipLabel = scheduledSeatType
      ? getScheduledSeatChangeLabel(
          seatType,
          scheduledSeatType,
          scheduledSeatChangeAt
        )
      : `${seatTypeDisplayName(seatType)} seat`;
    return (
      <DataTable.CellContent className="justify-center">
        <Tooltip
          tooltipTriggerAsChild
          label={tooltipLabel}
          trigger={
            <span className="flex cursor-default items-center justify-center">
              <SeatTypeIcon seatType={seatType} />
            </span>
          }
        />
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-16",
    headerAlign: "center",
  },
};

function computeSeatUsage({
  seatType,
  memberUsageLimit,
  seatBalanceAwu,
  consumedFromAllowanceAwuCredits,
}: {
  seatType: MembershipSeatType | null;
  memberUsageLimit: number | null;
  seatBalanceAwu: number | null;
  consumedFromAllowanceAwuCredits: number;
}): {
  percent: number;
  isOverAllowance: boolean;
  consumed: number;
  allowance: number;
} {
  const allowance = memberUsageLimit ?? 0;
  const isFreeWithBalance =
    seatType === "free" &&
    typeof seatBalanceAwu === "number" &&
    typeof memberUsageLimit === "number";
  const consumed = isFreeWithBalance
    ? Math.max(0, memberUsageLimit - seatBalanceAwu)
    : consumedFromAllowanceAwuCredits;
  if (allowance <= 0) {
    return {
      percent: consumed > 0 ? 100 : 0,
      isOverAllowance: consumed > 0,
      consumed,
      allowance,
    };
  }
  return {
    percent: Math.min(100, (consumed / allowance) * 100),
    isOverAllowance: consumed > allowance,
    consumed,
    allowance,
  };
}

const seatUsageColumn: ColumnDef<RowData, string> = {
  id: "seatUsage" as const,
  header: "Seat usage",
  enableSorting: false,
  accessorFn: (row) =>
    computeSeatUsage({
      seatType: row.seatType,
      memberUsageLimit: row.memberUsageLimit,
      seatBalanceAwu: row.seatBalanceAwu,
      consumedFromAllowanceAwuCredits: row.consumedFromAllowanceAwuCredits,
    }).percent.toString(),
  cell: (info: Info) => {
    const {
      seatType,
      memberUsageLimit,
      seatBalanceAwu,
      seatUsageTarget,
      isSeatChangePending,
    } = info.row.original;
    if (
      isSeatChangePending ||
      !seatType ||
      memberUsageLimit === null ||
      memberUsageLimit <= 0
    ) {
      return (
        <DataTable.CellContent className="justify-center">
          <span className="text-sm text-muted-foreground">--</span>
        </DataTable.CellContent>
      );
    }
    const { percent, consumed, allowance } = computeSeatUsage({
      seatType,
      memberUsageLimit,
      seatBalanceAwu,
      consumedFromAllowanceAwuCredits:
        info.row.original.consumedFromAllowanceAwuCredits,
    });
    const isOffPace =
      seatUsageTarget === "elevated" || seatUsageTarget === "critical";
    const colorClassName =
      percent >= 100
        ? "text-red-500"
        : isOffPace
          ? "text-warning-500"
          : "text-muted-foreground";
    return (
      <DataTable.CellContent className="justify-center">
        <Tooltip
          tooltipTriggerAsChild
          label={`${formatCredits(consumed)} / ${formatCredits(allowance)} credits used`}
          trigger={
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium", colorClassName)}>
                {Math.round(percent)}%
              </span>
              <ProgressRing
                percentage={percent}
                label="Seat usage"
                className={colorClassName}
              />
            </div>
          }
        />
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-24",
    headerAlign: "center",
  },
};

function buildConsumedAwuCreditsColumn(
  creditsResetAt: string | null
): ColumnDef<RowData, string> {
  return {
    id: "consumedAwuCredits" as const,
    header: () => (
      <div className="flex flex-col">
        <span>Credits usage this month</span>
        {creditsResetAt && (
          <span className="text-xs font-normal text-muted-foreground">
            Limits reset on{" "}
            {new Date(creditsResetAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        )}
      </div>
    ),
    accessorFn: (row) => row.consumedAwuCredits.toString(),
    cell: (info: Info) => (
      <div className="w-full pr-3">
        <AwuUsageBar
          consumed={info.row.original.consumedAwuCredits}
          consumedFromAllowance={
            info.row.original.consumedFromAllowanceAwuCredits
          }
          consumedFromPool={info.row.original.consumedFromPoolAwuCredits}
          memberUsageLimit={info.row.original.memberUsageLimit}
          seatBalanceAwu={info.row.original.seatBalanceAwu}
          effectiveLimit={info.row.original.spendLimitAwuCredits ?? 0}
          spendLimitSource={info.row.original.spendLimitSource}
          seatType={info.row.original.seatType}
          isTotalAllowedUsagePending={
            info.row.original.isTotalAllowedUsagePending
          }
        />
      </div>
    ),
    enableSorting: true,
  };
}

function buildModelTiersColumn(
  variant: MembersUsageTableVariant
): ColumnDef<RowData, string> {
  return {
    id: "modelTiers" as const,
    header: () => (
      <span className="flex items-center gap-1">
        {(() => {
          switch (variant) {
            case "compact":
              return "Models";
            case "legacy":
              return "Models tier";
            default:
              assertNeverAndIgnore(variant);
              return "Models tier";
          }
        })()}
        <ModelTiersInfoButton />
      </span>
    ),
    enableSorting: false,
    accessorFn: (row) => row.modelTiersSummary,
    cell: (info: Info) => {
      const summary = info.row.original.modelTiersSummary;
      const customSuffix = info.row.original.hasUserLevelModelTiersOverride
        ? " (custom)"
        : "";

      return (
        <DataTable.CellContent>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {summary}
            {customSuffix}
          </span>
        </DataTable.CellContent>
      );
    },
    meta: {
      className: "w-48",
    },
  };
}

const actionsColumn: ColumnDef<RowData, string> = {
  id: "actions" as const,
  header: "",
  enableSorting: false,
  accessorKey: "actions",
  cell: (info: Info) => (
    <div
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DataTable.MoreButton menuItems={info.row.original.menuItems} />
    </div>
  ),
  meta: {
    className: "w-14",
  },
};

function buildCreditPlanColumns({
  creditsResetAt,
  variant,
}: {
  creditsResetAt: string | null;
  variant: MembersUsageTableVariant;
}): ColumnDef<RowData, string>[] {
  return [
    ...(() => {
      switch (variant) {
        case "compact":
          return [seatsIconColumn, seatUsageColumn];
        case "legacy":
          return [seatTypeColumn];
        default:
          assertNeverAndIgnore(variant);
          return [seatTypeColumn];
      }
    })(),
    {
      ...buildConsumedAwuCreditsColumn(creditsResetAt),
      meta: { className: "w-64" },
    },
  ];
}

function buildColumns({
  enableSelection,
  showGroupsColumn,
  showModelTiersColumn,
  showSeatAndCredits,
  creditsResetAt,
  variant,
}: {
  enableSelection: boolean;
  showGroupsColumn: boolean;
  showModelTiersColumn: boolean;
  showSeatAndCredits: boolean;
  creditsResetAt: string | null;
  variant: MembersUsageTableVariant;
}): ColumnDef<RowData, string>[] {
  return [
    ...(enableSelection ? [createSelectionColumn<RowData>()] : []),
    nameColumn,
    ...(showGroupsColumn ? [groupsColumn] : []),
    ...(showModelTiersColumn ? [buildModelTiersColumn(variant)] : []),
    ...(showSeatAndCredits
      ? buildCreditPlanColumns({ creditsResetAt, variant })
      : []),
    // Every row action belongs to one of these two groups.
    ...(showSeatAndCredits || showModelTiersColumn ? [actionsColumn] : []),
  ];
}

// "compact" is the Poke Pool Usage page layout: no "Up to " prefix on the
// Models tier summary, a "Models" header instead of "Models tier". "legacy"
// keeps the customer-facing usage page unchanged.
export type MembersUsageTableVariant = "legacy" | "compact";

interface MembersUsageTableProps {
  members: MemberUsageType[];
  // End of the current billing period (workspace-level, from the members-usage
  // response) shown under the credits column header. Null hides the line.
  creditsResetAt: string | null;
  isLoading: boolean;
  isRefreshing?: boolean;
  totalAllowedUsagePendingMemberIds: ReadonlySet<string>;
  seatChangePendingMemberIds: ReadonlySet<string>;
  isSeatBased: boolean;
  showSpendLimit: boolean;
  // Disables every row action (Poke's read-only view).
  readOnly?: boolean;
  // Seat and credits usage columns plus the seat row actions. Off for
  // workspaces that are not on a credit plan.
  showSeatAndCredits?: boolean;
  // Disables only the seat-assign/change/remove actions (e.g. while the
  // subscription has a cancellation scheduled), independent of `readOnly`.
  seatActionsDisabled?: boolean;
  onChangeSeat: (member: MemberUsageType) => void;
  onRemoveSeat: (member: MemberUsageType) => void;
  onEditSpendLimit: (member: MemberUsageType) => void;
  onSetUserModelTier?: (
    member: MemberUsageType,
    selection: UserModelTierSelection
  ) => void;
  showModelTiersColumn?: boolean;
  variant?: MembersUsageTableVariant;
  userModelTierSelectionByUserId?: Record<string, UserModelTierSelection>;
  userAllowedModelTiersByUserId?: Record<string, ModelsTierName[]>;
  groupModelTiersByGroupId?: Record<string, ModelsTierName[]>;
  workspaceAllowedModelTiers?: ModelsTierName[];
  groupNameToId?: Map<string, string>;
  modelTierDefinitionByName?: Map<ModelsTierName, ModelsTierDefinition>;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  totalRowCount: number;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  showGroupsColumn?: boolean;
  enableSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
}

export function MembersUsageTable({
  members,
  creditsResetAt,
  isLoading,
  isRefreshing = false,
  totalAllowedUsagePendingMemberIds,
  seatChangePendingMemberIds,
  isSeatBased,
  showSpendLimit,
  readOnly = false,
  showSeatAndCredits = true,
  seatActionsDisabled = false,
  onChangeSeat,
  onRemoveSeat,
  onEditSpendLimit,
  onSetUserModelTier,
  showModelTiersColumn = false,
  variant = "legacy",
  userModelTierSelectionByUserId = EMPTY_USER_MODEL_TIER_SELECTION_BY_USER_ID,
  userAllowedModelTiersByUserId = EMPTY_USER_ALLOWED_MODEL_TIERS_BY_USER_ID,
  groupModelTiersByGroupId = EMPTY_GROUP_MODEL_TIERS_BY_GROUP_ID,
  workspaceAllowedModelTiers = EMPTY_WORKSPACE_ALLOWED_MODEL_TIERS,
  groupNameToId = EMPTY_GROUP_NAME_TO_ID,
  modelTierDefinitionByName = EMPTY_MODEL_TIER_DEFINITION_BY_NAME,
  pagination,
  setPagination,
  totalRowCount,
  sorting,
  setSorting,
  showGroupsColumn = false,
  enableSelection = false,
  rowSelection,
  onRowSelectionChange,
}: MembersUsageTableProps) {
  const rows: RowData[] = useMemo(
    () =>
      members.map((m) => {
        const hasSeat = m.seatType !== null && m.seatType !== "none";
        const canEditSeat = showSeatAndCredits && isSeatBased && hasSeat;
        const resolvedModelTiers = showModelTiersColumn
          ? resolveModelTiersForUser({
              userId: m.sId,
              groupNames: m.groups,
              groupNameToId,
              userAllowedTierNamesByUserId: userAllowedModelTiersByUserId,
              groupTierNamesByGroupId: groupModelTiersByGroupId,
              workspaceAllowedTierNames: workspaceAllowedModelTiers,
            })
          : null;

        return {
          sId: m.sId,
          name: m.name,
          email: m.email,
          image: m.image,
          groups: m.groups,
          seatType: m.seatType,
          memberUsageLimit: m.memberUsageLimit,
          seatBalanceAwu: m.seatBalanceAwu,
          consumedAwuCredits: m.consumedAwuCredits,
          consumedFromAllowanceAwuCredits: m.consumedFromAllowanceAwuCredits,
          consumedFromPoolAwuCredits: m.consumedFromPoolAwuCredits,
          seatUsageTarget: m.seatUsageTarget,
          spendLimitAwuCredits: m.spendLimitAwuCredits,
          spendLimitSource: m.spendLimitSource,
          scheduledSeatType: m.scheduledSeatType,
          scheduledSeatChangeAt: m.scheduledSeatChangeAt,
          isTotalAllowedUsagePending: totalAllowedUsagePendingMemberIds.has(
            m.sId
          ),
          isSeatChangePending: seatChangePendingMemberIds.has(m.sId),
          modelTiersSummary: (() => {
            const maxTierName = getMaxTierName(resolvedModelTiers?.tiers ?? []);
            switch (variant) {
              case "compact":
                return maxTierName
                  ? getModelsTierDisplayName(maxTierName)
                  : "--";
              case "legacy":
                return formatModelTiersSummary(maxTierName);
              default:
                assertNeverAndIgnore(variant);
                return formatModelTiersSummary(maxTierName);
            }
          })(),
          hasUserLevelModelTiersOverride: resolvedModelTiers?.source === "user",
          menuItems: [
            ...(showSeatAndCredits && !hasSeat
              ? [
                  {
                    kind: "item" as const,
                    label: "Assign seat",
                    disabled: readOnly || seatActionsDisabled,
                    onClick: () => onChangeSeat(m),
                  },
                ]
              : []),
            ...(canEditSeat
              ? [
                  {
                    kind: "item" as const,
                    label: "Change seat type",
                    disabled: readOnly || seatActionsDisabled,
                    onClick: () => onChangeSeat(m),
                  },
                ]
              : []),
            ...(showSpendLimit && hasSeat && m.seatType !== "free"
              ? [
                  {
                    kind: "item" as const,
                    label: "Edit spend limit",
                    disabled: readOnly,
                    onClick: () => onEditSpendLimit(m),
                  },
                ]
              : []),
            ...(showModelTiersColumn && onSetUserModelTier
              ? [
                  {
                    kind: "submenu" as const,
                    label: "Models tier",
                    selectionMode: "checkbox" as const,
                    items: getUserModelTierMenuItemsWithSelection({
                      selectedValue:
                        userModelTierSelectionByUserId[m.sId] ??
                        INHERIT_MODEL_TIER,
                      inheritLabel: formatUserModelTierInheritLabel({
                        groupNames: m.groups,
                        groupNameToId,
                        groupTierNamesByGroupId: groupModelTiersByGroupId,
                        workspaceAllowedTierNames: workspaceAllowedModelTiers,
                      }),
                    }).map((tierItem) => ({
                      id: tierItem.id,
                      name: tierItem.name,
                      description: tierItem.description,
                      checked: tierItem.checked,
                    })),
                    onSelect: (itemId: string) =>
                      onSetUserModelTier(m, toUserModelTierSelection(itemId)),
                  },
                ]
              : []),
            ...(canEditSeat
              ? [
                  {
                    kind: "item" as const,
                    label: "Remove seat",
                    variant: "warning" as const,
                    disabled: readOnly || seatActionsDisabled,
                    onClick: () => onRemoveSeat(m),
                  },
                ]
              : []),
          ],
        };
      }),
    [
      members,
      totalAllowedUsagePendingMemberIds,
      seatChangePendingMemberIds,
      isSeatBased,
      showSpendLimit,
      showModelTiersColumn,
      variant,
      userModelTierSelectionByUserId,
      userAllowedModelTiersByUserId,
      groupModelTiersByGroupId,
      workspaceAllowedModelTiers,
      groupNameToId,
      readOnly,
      showSeatAndCredits,
      seatActionsDisabled,
      onChangeSeat,
      onRemoveSeat,
      onEditSpendLimit,
      onSetUserModelTier,
    ]
  );

  const columns = useMemo(
    () =>
      buildColumns({
        enableSelection,
        showGroupsColumn,
        showModelTiersColumn,
        showSeatAndCredits,
        creditsResetAt,
        variant,
      }),
    [
      enableSelection,
      showGroupsColumn,
      showModelTiersColumn,
      showSeatAndCredits,
      creditsResetAt,
      variant,
    ]
  );

  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={
          isRefreshing
            ? "pointer-events-none opacity-50 transition-opacity"
            : "transition-opacity"
        }
      >
        <DataTable
          data={rows}
          columns={columns}
          pagination={pagination}
          setPagination={setPagination}
          totalRowCount={totalRowCount}
          sorting={sorting}
          setSorting={setSorting}
          isServerSideSorting
          enableRowSelection={enableSelection}
          rowSelection={rowSelection}
          setRowSelection={onRowSelectionChange}
          getRowId={(row) => row.sId}
        />
      </div>
      {isRefreshing && (
        <div className="absolute inset-x-0 top-16 flex justify-center">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}
