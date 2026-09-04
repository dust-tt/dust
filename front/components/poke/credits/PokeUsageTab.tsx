import { PokeWorkspaceUsageChart } from "@app/components/poke/analytics/PokeWorkspaceUsageChart";
import { AlertChip } from "@app/components/poke/credits/AlertChip";
import { CreditStateLogsLink } from "@app/components/poke/credits/CreditStateLogsLink";
import { PokeApiKeysUsageTable } from "@app/components/poke/credits/PokeApiKeysUsageTable";
import { PokeAwuUsageFromAnalyticsChart } from "@app/components/poke/credits/PokeAwuUsageFromAnalyticsChart";
import { PokeMembersUsageTable } from "@app/components/poke/credits/PokeMembersUsageTable";
import { PokeTopUpsHistoryTable } from "@app/components/poke/credits/PokeTopUpsHistoryTable";
import { ReconcileCreditStateButton } from "@app/components/poke/credits/ReconcileCreditStateButton";
import type { RateLimiterState } from "@app/lib/api/credits/members_usage";
import type {
  PokeCreditUsageConfig,
  PokeProgrammaticAlerts,
  PokeStripeSubscriptionWire,
} from "@app/lib/api/poke/workspace_info";
import { formatCredits, formatCreditsPrecise } from "@app/lib/client/credits";
import type { DefaultMetronomeAlerts } from "@app/lib/metronome/alerts/default_alerts";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { usePokeAwuPoolSummary } from "@app/poke/swr/credits";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import type { SubscriptionType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Chip,
  ContentMessage,
  ProgressBar,
  Spinner,
} from "@dust-tt/sparkle";

interface PokeUsageTabProps {
  owner: WorkspaceType;
  hasMetronomeBillingUsage: boolean;
  subscription: SubscriptionType;
  stripeSubscription: PokeStripeSubscriptionWire | null;
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditState: WorkspaceProgrammaticCreditState;
  programmaticWarningReached: boolean;
  spendLimitRateCapEnabled: boolean;
  programmaticRateLimiterState: RateLimiterState | null;
  programmaticSpendLimitRateCapCount: number | null;
  programmaticEsConsumedAwuCredits: number | null;
  programmaticMetronomeConsumedAwuCredits: number | null;
  creditUsageConfig: PokeCreditUsageConfig | null;
  poolAlert: MetronomeAlertRef | null;
  programmaticAlerts: PokeProgrammaticAlerts;
  usageCapAlert: MetronomeAlertRef | null;
  defaultAlerts: DefaultMetronomeAlerts;
}

interface SpendCountersInlineProps {
  esConsumedAwuCredits: number | null;
  rateLimiterAwuCredits: number | null;
  metronomeConsumedAwuCredits: number | null;
}

const formatCreditsOrDash = (value: number | null): string =>
  value !== null ? formatCreditsPrecise(value) : "—";

// The three spend figures for a cap dimension shown together to spot
// divergence: ES = Elasticsearch-derived, RL = Redis rate-limiter counter (the
// value enforcement reads), MT = Metronome-derived. Mirrors the
// "Consumed (ES / RL / MT)" column in the members table.
function SpendCountersInline({
  esConsumedAwuCredits,
  rateLimiterAwuCredits,
  metronomeConsumedAwuCredits,
}: SpendCountersInlineProps) {
  return (
    <span className="text-xs text-muted-foreground">
      ES {formatCreditsOrDash(esConsumedAwuCredits)} / RL{" "}
      {formatCreditsOrDash(rateLimiterAwuCredits)} / MT{" "}
      {formatCreditsOrDash(metronomeConsumedAwuCredits)}
    </span>
  );
}

// The rate-limiter's verdict, rendered as a chip. Labels distinguish capped vs
// near-limit (both warning-toned). Mirrors PokeMembersUsageTable /
// PokeApiKeysUsageTable.
const RATE_LIMITER_STATE_CHIP: Record<
  RateLimiterState,
  { color: "success" | "warning"; label: string }
> = {
  capped: { color: "warning", label: "capped" },
  near_limit: { color: "warning", label: "near limit" },
  ok: { color: "success", label: "ok" },
};

type CreditStateChipColor = "success" | "warning" | "warning" | "info";

// Shared color mapping for the workspace pool and programmatic credit states.
// Both unions share the active/low/critical/depleted members; `overage` is
// pool-only.
function creditStateChipColor(
  state: WorkspacePoolCreditState | WorkspaceProgrammaticCreditState
): CreditStateChipColor {
  switch (state) {
    case "active":
      return "success";
    case "active_low_balance":
      return "warning";
    case "active_critical_balance":
      return "warning";
    case "overage":
      return "info";
    case "depleted":
      return "warning";
    default:
      assertNeverAndIgnore(state);
      return "info";
  }
}

interface PokeCreditStatesCardProps {
  owner: WorkspaceType;
  creditUsageConfig: PokeCreditUsageConfig | null;
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditState: WorkspaceProgrammaticCreditState;
  programmaticWarningReached: boolean;
  spendLimitRateCapEnabled: boolean;
  programmaticRateLimiterState: RateLimiterState | null;
  programmaticSpendLimitRateCapCount: number | null;
  programmaticEsConsumedAwuCredits: number | null;
  programmaticMetronomeConsumedAwuCredits: number | null;
  poolAlert: MetronomeAlertRef | null;
  programmaticAlerts: PokeProgrammaticAlerts;
}

function PokeCreditStatesCard({
  owner,
  creditUsageConfig,
  poolCreditState,
  programmaticCreditState,
  programmaticWarningReached,
  spendLimitRateCapEnabled,
  programmaticRateLimiterState,
  programmaticSpendLimitRateCapCount,
  programmaticEsConsumedAwuCredits,
  programmaticMetronomeConsumedAwuCredits,
  poolAlert,
  programmaticAlerts,
}: PokeCreditStatesCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        Credit state machine
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Pool</span>
          <Chip
            size="xs"
            color={creditStateChipColor(poolCreditState)}
            label={poolCreditState}
          />
          <AlertChip alert={poolAlert} label="balance alert" />
          <CreditStateLogsLink machine="pool" workspaceId={owner.sId} />
          <ReconcileCreditStateButton owner={owner} target="pool" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Programmatic</span>
          {spendLimitRateCapEnabled ? (
            // Flag on: the rate-limiter is authoritative, so show its verdict
            // and do not read the Metronome `programmaticCreditState`. The RL
            // state already encodes near-limit, so no separate warning chip.
            programmaticRateLimiterState !== null ? (
              <Chip
                size="xs"
                color={
                  RATE_LIMITER_STATE_CHIP[programmaticRateLimiterState].color
                }
                label={RATE_LIMITER_STATE_CHIP[programmaticRateLimiterState].label}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )
          ) : (
            <>
              <Chip
                size="xs"
                color={creditStateChipColor(programmaticCreditState)}
                label={programmaticCreditState}
              />
              {programmaticWarningReached && (
                <Chip size="xs" color="warning" label="near limit" />
              )}
            </>
          )}
          <span className="text-xs text-muted-foreground">
            cap:{" "}
            {creditUsageConfig
              ? `${formatCredits(creditUsageConfig.programmaticMonthlyCapAwuCredits)} credits`
              : "—"}
          </span>
          <SpendCountersInline
            esConsumedAwuCredits={programmaticEsConsumedAwuCredits}
            rateLimiterAwuCredits={programmaticSpendLimitRateCapCount}
            metronomeConsumedAwuCredits={
              programmaticMetronomeConsumedAwuCredits
            }
          />
          <AlertChip alert={programmaticAlerts.cap} label="cap alert" />
          <AlertChip alert={programmaticAlerts.warning} label="warning (80%)" />
          <AlertChip alert={programmaticAlerts.low} label="low (-100)" />
          <AlertChip
            alert={programmaticAlerts.critical}
            label="critical (-10)"
          />
          <CreditStateLogsLink machine="programmatic" workspaceId={owner.sId} />
          <ReconcileCreditStateButton owner={owner} target="programmatic" />
        </div>
      </div>
    </div>
  );
}

interface PokeCreditConfigCardProps {
  creditUsageConfig: PokeCreditUsageConfig | null;
  usageCapAlert: MetronomeAlertRef | null;
}

function PokeCreditConfigCard({
  creditUsageConfig,
  usageCapAlert,
}: PokeCreditConfigCardProps) {
  const paygEnabled = creditUsageConfig?.paygEnabled ?? false;
  const usageCapCredits = creditUsageConfig?.usageCapCredits ?? null;
  const defaultDiscountPercent = creditUsageConfig?.defaultDiscountPercent ?? 0;
  const hasUsageCap = usageCapCredits !== null && usageCapCredits > 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        Credit configuration
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">PAYG</span>
          <Chip
            size="xs"
            color={paygEnabled ? "success" : "warning"}
            label={paygEnabled ? "enabled" : "disabled"}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Usage cap</span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            {hasUsageCap ? (
              <>
                {formatCredits(usageCapCredits)} credits
                <AlertChip alert={usageCapAlert} label="alert" />
              </>
            ) : (
              "disabled"
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Default discount
          </span>
          <span className="text-sm font-medium text-foreground">
            {defaultDiscountPercent}%
          </span>
        </div>
      </div>
    </div>
  );
}

interface PokeDefaultAlertsCardProps {
  defaultAlerts: DefaultMetronomeAlerts;
}

// Account-wide default alerts (created by the Metronome setup script, shared
// across all customers). Hidden entirely when none resolve (setup not run in
// this environment).
function PokeDefaultAlertsCard({ defaultAlerts }: PokeDefaultAlertsCardProps) {
  const hasAny = Object.values(defaultAlerts).some((alert) => alert !== null);
  if (!hasAny) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        Default account alerts
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Pool balance</span>
          <AlertChip alert={defaultAlerts.poolEmpty} label="empty (0)" />
          <AlertChip alert={defaultAlerts.poolLow} label="low (100)" />
          <AlertChip alert={defaultAlerts.poolCritical} label="critical (10)" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Seat balance</span>
          <AlertChip alert={defaultAlerts.seatEmpty} label="empty (0)" />
          <AlertChip alert={defaultAlerts.seatLowMax} label="low · max (8k)" />
          <AlertChip
            alert={defaultAlerts.seatLowPro}
            label="low · pro (1.6k)"
          />
        </div>
      </div>
    </div>
  );
}

interface PokeCreditPoolCardProps {
  owner: WorkspaceType;
}

function PokeCreditPoolCard({ owner }: PokeCreditPoolCardProps) {
  const { awuPoolSummary, isAwuPoolSummaryLoading, isAwuPoolSummaryError } =
    usePokeAwuPoolSummary({ owner });

  if (isAwuPoolSummaryLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (isAwuPoolSummaryError || !awuPoolSummary) {
    return (
      <ContentMessage
        title="Failed to load Workspace Credits Pool"
        icon={AlertCircle}
        variant="warning"
      >
        Could not load the credit pool summary for this workspace.
      </ContentMessage>
    );
  }

  const { totalActiveCredits, totalRemainingCredits, overageCredits } =
    awuPoolSummary;
  const consumed = Math.max(0, totalActiveCredits - totalRemainingCredits);
  const consumedPct =
    totalActiveCredits > 0
      ? Math.min((consumed / totalActiveCredits) * 100, 100)
      : 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Workspace Credits Pool
        </span>
        <span className="text-sm font-semibold text-foreground">
          {formatCredits(consumed)} / {formatCredits(totalActiveCredits)}{" "}
          credits
        </span>
      </div>
      <ProgressBar
        className="h-2 w-full bg-muted-foreground/10"
        values={[
          { value: consumedPct, className: "bg-highlight" },
          { value: 100 - consumedPct, className: "bg-transparent" },
        ]}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>{formatCredits(totalRemainingCredits)} credits remaining</span>
        {overageCredits !== null && overageCredits > 0 && (
          <span>{formatCredits(overageCredits)} overage credits</span>
        )}
      </div>
    </div>
  );
}

export function PokeUsageTab({
  owner,
  hasMetronomeBillingUsage,
  subscription,
  stripeSubscription,
  poolCreditState,
  programmaticCreditState,
  programmaticWarningReached,
  spendLimitRateCapEnabled,
  programmaticRateLimiterState,
  programmaticSpendLimitRateCapCount,
  programmaticEsConsumedAwuCredits,
  programmaticMetronomeConsumedAwuCredits,
  creditUsageConfig,
  poolAlert,
  programmaticAlerts,
  usageCapAlert,
  defaultAlerts,
}: PokeUsageTabProps) {
  if (!hasMetronomeBillingUsage) {
    // Non-credit-based workspaces (no Metronome contract) have no credit
    // diagnostics, but fair-use AWU limits still apply to them (free/trial), so
    // the members table — which surfaces per-user fair-use usage — is shown
    // alongside the activity chart.
    return (
      <div className="flex flex-col gap-4">
        <PokeWorkspaceUsageChart workspaceId={owner.sId} period={30} />
        <PokeMembersUsageTable
          owner={owner}
          isCreditBased={hasMetronomeBillingUsage}
        />
      </div>
    );
  }

  const billingCycleStartDay = stripeSubscription?.current_period_start
    ? new Date(stripeSubscription.current_period_start * 1000).getDate()
    : subscription.startDate
      ? new Date(subscription.startDate).getDate()
      : null;

  return (
    <div className="flex flex-col gap-4">
      <PokeWorkspaceUsageChart workspaceId={owner.sId} period={30} />
      <PokeCreditStatesCard
        owner={owner}
        creditUsageConfig={creditUsageConfig}
        poolCreditState={poolCreditState}
        programmaticCreditState={programmaticCreditState}
        programmaticWarningReached={programmaticWarningReached}
        spendLimitRateCapEnabled={spendLimitRateCapEnabled}
        programmaticRateLimiterState={programmaticRateLimiterState}
        programmaticSpendLimitRateCapCount={programmaticSpendLimitRateCapCount}
        programmaticEsConsumedAwuCredits={programmaticEsConsumedAwuCredits}
        programmaticMetronomeConsumedAwuCredits={
          programmaticMetronomeConsumedAwuCredits
        }
        poolAlert={poolAlert}
        programmaticAlerts={programmaticAlerts}
      />
      <PokeCreditConfigCard
        creditUsageConfig={creditUsageConfig}
        usageCapAlert={usageCapAlert}
      />
      <PokeDefaultAlertsCard defaultAlerts={defaultAlerts} />
      <PokeCreditPoolCard owner={owner} />
      <PokeTopUpsHistoryTable owner={owner} />
      <PokeMembersUsageTable
        owner={owner}
        isCreditBased={hasMetronomeBillingUsage}
      />
      <PokeApiKeysUsageTable owner={owner} />
      {billingCycleStartDay && (
        <PokeAwuUsageFromAnalyticsChart
          owner={owner}
          billingCycleStartDay={billingCycleStartDay}
        />
      )}
    </div>
  );
}
