import type { CreditUsageCardVariant } from "@app/components/app/CreditUsageCard";
import { CreditUsageCard } from "@app/components/app/CreditUsageCard";
import {
  formatCredits,
  formatRelativeResetDay,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/client/credits";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Button } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural, select } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

interface CreditUsageStateBase {
  usedPercentage: number;
}

interface BillingPeriodCreditUsageState extends CreditUsageStateBase {
  kind: "billing_period";
  resetInDays: number;
  target: CreditUsageTarget;
}

interface RollingWindowCreditUsageState extends CreditUsageStateBase {
  kind: "rolling_window";
  usedCredits: number;
  limitCredits: number;
  timeframe: MaxAwuCreditsTimeframeType;
  // Upcoming credit refills, oldest first. Only meaningful for a true rolling
  // window (day/week/month) - omitted for the "lifetime" free-seat case, which
  // never refills.
  refillSchedule?: { date: string; credits: number }[];
  // When true the cap uses a fixed window instead of a rolling day count.
  isFixedWindow?: boolean;
  nextResetAt?: string | null;
}

export type CreditUsageState =
  | BillingPeriodCreditUsageState
  | RollingWindowCreditUsageState;

type Translate = (descriptor: MessageDescriptor) => string;

interface CreditUsageProps {
  state: CreditUsageState;
  variant: CreditUsageCardVariant;
  onLearnMore?: () => void;
}

export function CreditUsageLearnMoreButton({
  onClick,
}: {
  onClick: () => void;
}) {
  const { t } = useLingui();

  return (
    <Button
      label={t`See your usage`}
      variant="outline"
      size="sm"
      className="w-full"
      onClick={onClick}
    />
  );
}

function getBillingPeriodUsageDescription(
  state: BillingPeriodCreditUsageState,
  variant: CreditUsageCardVariant,
  t: Translate
): string {
  const { resetInDays } = state;

  if (variant === "profile_menu") {
    return t(
      msg`Reset in ${plural(resetInDays, { one: "# day", other: "# days" })}`
    );
  }

  switch (state.target) {
    case "elevated":
      return t(
        msg`Usage is above target · Credit reset in ${plural(resetInDays, {
          one: "# day",
          other: "# days",
        })}`
      );
    case "critical":
      return t(
        msg`Usage is well above target · Credit reset in ${plural(resetInDays, {
          one: "# day",
          other: "# days",
        })}`
      );
    case "on_target":
      return t(
        msg`Credit reset in ${plural(resetInDays, {
          one: "# day",
          other: "# days",
        })}`
      );
    default:
      assertNeverAndIgnore(state.target);
      return "";
  }
}

// The free-seat lifetime cap shares the rolling_window kind's state shape
// (used/limit credits) but never refills, so it gets its own description
// rather than a rolling-window day count.
function getLifetimeUsageDescription(
  state: RollingWindowCreditUsageState,
  t: Translate
): string {
  const usedCredits = formatCredits(state.usedCredits);
  const limitCredits = formatCredits(state.limitCredits);
  return t(msg`${usedCredits} of ${limitCredits} used on your current plan`);
}

function getRollingWindowUsageDescription(
  state: RollingWindowCreditUsageState,
  t: Translate
): string {
  if (state.timeframe === "lifetime") {
    return getLifetimeUsageDescription(state, t);
  }
  if (state.isFixedWindow && state.nextResetAt) {
    const { kind: resetDayKind, day: resetDay } = formatRelativeResetDay(
      state.nextResetAt
    );
    return t(
      msg`${select(resetDayKind, {
        relative: `Resets ${resetDay}`,
        weekday: `Resets on ${resetDay}`,
        other: `Resets on ${resetDay}`,
      })}`
    );
  }
  const windowDays =
    getTimeframeSecondsFromLiteral(state.timeframe) / (24 * 60 * 60);
  return t(msg`Resets on a rolling ${windowDays}-day basis`);
}

function getUsageDescription(
  state: CreditUsageState,
  variant: CreditUsageCardVariant,
  t: Translate
): string {
  switch (state.kind) {
    case "billing_period":
      return getBillingPeriodUsageDescription(state, variant, t);
    case "rolling_window":
      return getRollingWindowUsageDescription(state, t);
    default:
      assertNeverAndIgnore(state);
      return "";
  }
}

export function CreditUsage({ state, variant, onLearnMore }: CreditUsageProps) {
  const { t } = useLingui();
  const usageDescription = getUsageDescription(state, variant, t);
  const tone = state.kind === "billing_period" ? state.target : "on_target";
  const refillSchedule =
    state.kind === "rolling_window" ? state.refillSchedule : undefined;

  return (
    <CreditUsageCard
      label={t`Credits`}
      usedPercentage={state.usedPercentage}
      tone={tone}
      variant={variant}
      refillSchedule={refillSchedule}
    >
      {onLearnMore ? (
        <div className="flex flex-col gap-2">
          <span>{usageDescription}</span>
          <CreditUsageLearnMoreButton onClick={onLearnMore} />
        </div>
      ) : (
        usageDescription
      )}
    </CreditUsageCard>
  );
}
