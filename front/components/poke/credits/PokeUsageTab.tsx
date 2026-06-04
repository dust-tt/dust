import { CreditStateLogsLink } from "@app/components/poke/credits/CreditStateLogsLink";
import { PokeAwuUsageChart } from "@app/components/poke/credits/PokeAwuUsageChart";
import { PokeMembersUsageTable } from "@app/components/poke/credits/PokeMembersUsageTable";
import { ReconcileCreditStateButton } from "@app/components/poke/credits/ReconcileCreditStateButton";
import type {
  PokeCreditUsageConfig,
  PokeProgrammaticAlertIds,
  PokeStripeSubscriptionWire,
} from "@app/lib/api/poke/workspace_info";
import type { DefaultMetronomeAlertIds } from "@app/lib/metronome/alerts/default_alerts";
import { getMetronomeAlertUrl } from "@app/lib/metronome/urls";
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
  Icon,
  LinkExternal01,
  LinkWrapper,
  Spinner,
} from "@dust-tt/sparkle";

interface PokeUsageTabProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  stripeSubscription: PokeStripeSubscriptionWire | null;
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditState: WorkspaceProgrammaticCreditState;
  creditUsageConfig: PokeCreditUsageConfig | null;
  poolAlertId: string | null;
  programmaticAlertIds: PokeProgrammaticAlertIds;
  usageCapAlertId: string | null;
  defaultAlertIds: DefaultMetronomeAlertIds;
}

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

// A deep-link to a Metronome alert: an optional label plus an external-link
// icon. Renders nothing when the alert id is unknown (alert not configured).
function AlertLink({
  alertId,
  label,
}: {
  alertId: string | null;
  label?: string;
}) {
  if (!alertId) {
    return null;
  }
  return (
    <LinkWrapper
      href={getMetronomeAlertUrl(alertId)}
      target="_blank"
      className="inline-flex items-center gap-0.5 text-xs text-highlight-400"
    >
      {label ? <span>{label}</span> : null}
      <Icon visual={LinkExternal01} size="xs" />
    </LinkWrapper>
  );
}

type CreditStateChipColor = "success" | "warning" | "rose" | "info";

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
      return "rose";
    default:
      assertNeverAndIgnore(state);
      return "info";
  }
}

interface PokeCreditStatesCardProps {
  owner: WorkspaceType;
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditState: WorkspaceProgrammaticCreditState;
  poolAlertId: string | null;
  programmaticAlertIds: PokeProgrammaticAlertIds;
}

function PokeCreditStatesCard({
  owner,
  poolCreditState,
  programmaticCreditState,
  poolAlertId,
  programmaticAlertIds,
}: PokeCreditStatesCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 dark:border-border-night">
      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
        Credit state machine
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Pool
          </span>
          <Chip
            size="xs"
            color={creditStateChipColor(poolCreditState)}
            label={poolCreditState}
          />
          <AlertLink alertId={poolAlertId} label="balance alert" />
          <CreditStateLogsLink machine="pool" workspaceId={owner.sId} />
          <ReconcileCreditStateButton owner={owner} target="pool" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Programmatic
          </span>
          <Chip
            size="xs"
            color={creditStateChipColor(programmaticCreditState)}
            label={programmaticCreditState}
          />
          <AlertLink alertId={programmaticAlertIds.cap} label="cap alert" />
          <AlertLink
            alertId={programmaticAlertIds.warning}
            label="warning (80%)"
          />
          <AlertLink alertId={programmaticAlertIds.low} label="low (-100)" />
          <AlertLink
            alertId={programmaticAlertIds.critical}
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
  usageCapAlertId: string | null;
}

function PokeCreditConfigCard({
  creditUsageConfig,
  usageCapAlertId,
}: PokeCreditConfigCardProps) {
  const paygEnabled = creditUsageConfig?.paygEnabled ?? false;
  const usageCapCredits = creditUsageConfig?.usageCapCredits ?? null;
  const defaultDiscountPercent = creditUsageConfig?.defaultDiscountPercent ?? 0;
  const hasUsageCap = usageCapCredits !== null && usageCapCredits > 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 dark:border-border-night">
      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
        Credit configuration
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            PAYG
          </span>
          <Chip
            size="xs"
            color={paygEnabled ? "success" : "rose"}
            label={paygEnabled ? "enabled" : "disabled"}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Usage cap
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground dark:text-foreground-night">
            {hasUsageCap ? (
              <>
                {formatCredits(usageCapCredits)} credits
                <AlertLink alertId={usageCapAlertId} label="alert" />
              </>
            ) : (
              "disabled"
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Default discount
          </span>
          <span className="text-sm font-medium text-foreground dark:text-foreground-night">
            {defaultDiscountPercent}%
          </span>
        </div>
      </div>
    </div>
  );
}

interface PokeDefaultAlertsCardProps {
  defaultAlertIds: DefaultMetronomeAlertIds;
}

// Account-wide default alerts (created by the Metronome setup script, shared
// across all customers). Hidden entirely when none resolve (setup not run in
// this environment).
function PokeDefaultAlertsCard({
  defaultAlertIds,
}: PokeDefaultAlertsCardProps) {
  const hasAny = Object.values(defaultAlertIds).some((id) => id !== null);
  if (!hasAny) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 dark:border-border-night">
      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
        Default account alerts
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Pool balance
          </span>
          <AlertLink alertId={defaultAlertIds.poolEmpty} label="empty (0)" />
          <AlertLink alertId={defaultAlertIds.poolLow} label="low (100)" />
          <AlertLink
            alertId={defaultAlertIds.poolCritical}
            label="critical (10)"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            Seat balance
          </span>
          <AlertLink alertId={defaultAlertIds.seatEmpty} label="empty (0)" />
          <AlertLink
            alertId={defaultAlertIds.seatLowMax}
            label="low · max (8k)"
          />
          <AlertLink
            alertId={defaultAlertIds.seatLowPro}
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

  const {
    totalActiveCredits,
    totalRemainingCredits,
    resetDate,
    overageCredits,
  } = awuPoolSummary;
  const consumed = Math.max(0, totalActiveCredits - totalRemainingCredits);
  const consumedPct =
    totalActiveCredits > 0
      ? Math.min((consumed / totalActiveCredits) * 100, 100)
      : 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 dark:border-border-night">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground dark:text-foreground-night">
          Workspace Credits Pool
        </span>
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          {formatCredits(consumed)} / {formatCredits(totalActiveCredits)}{" "}
          credits
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10">
        <div
          className="h-full shrink-0 bg-highlight transition-all dark:bg-highlight-night"
          style={{ width: `${consumedPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
        <span>{formatCredits(totalRemainingCredits)} credits remaining</span>
        {overageCredits !== null && overageCredits > 0 && (
          <span>{formatCredits(overageCredits)} overage credits</span>
        )}
        {resetDate && (
          <span>
            Resets{" "}
            {new Date(resetDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export function PokeUsageTab({
  owner,
  subscription,
  stripeSubscription,
  poolCreditState,
  programmaticCreditState,
  creditUsageConfig,
  poolAlertId,
  programmaticAlertIds,
  usageCapAlertId,
  defaultAlertIds,
}: PokeUsageTabProps) {
  // Billing cycle start day from Stripe subscription, fallback to Dust
  // subscription (mirrors CreditsDataTable).
  const getBillingCycleStartDay = (): number | null => {
    if (stripeSubscription?.current_period_start) {
      return new Date(stripeSubscription.current_period_start * 1000).getDate();
    }
    if (subscription.startDate) {
      return new Date(subscription.startDate).getDate();
    }
    return null;
  };
  const billingCycleStartDay = getBillingCycleStartDay();

  return (
    <div className="flex flex-col gap-4">
      <PokeCreditStatesCard
        owner={owner}
        poolCreditState={poolCreditState}
        programmaticCreditState={programmaticCreditState}
        poolAlertId={poolAlertId}
        programmaticAlertIds={programmaticAlertIds}
      />
      <PokeCreditConfigCard
        creditUsageConfig={creditUsageConfig}
        usageCapAlertId={usageCapAlertId}
      />
      <PokeDefaultAlertsCard defaultAlertIds={defaultAlertIds} />
      <PokeCreditPoolCard owner={owner} />
      <PokeMembersUsageTable owner={owner} />
      {billingCycleStartDay && (
        <PokeAwuUsageChart
          owner={owner}
          billingCycleStartDay={billingCycleStartDay}
        />
      )}
    </div>
  );
}
