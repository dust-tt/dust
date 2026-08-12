import type { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import logger from "@app/logger/logger";
import { isCreditPricedPlan } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import moment from "moment-timezone";

/**
 * Period resolution for the consumption analytics endpoints: turns a requested
 * period into the [startDate, endDate) window the queries are scoped to.
 *
 * "this cycle" is the workspace's current billing cycle; "last N days" is a
 * relative window.
 */

export type ConsumptionPeriodInput =
  | { kind: "cycle" }
  | { kind: "days"; days: number };

export type ConsumptionPeriod = {
  startDate: string;
  endDate: string;
};

// Workspaces that are not on credit-based pricing have no billing cycle to
// speak of, so "this cycle" is the current UTC calendar month for them.
function calendarMonthBounds(now: Date): {
  cycleStart: Date;
  cycleEnd: Date;
} {
  const startOfMonth = moment.utc(now).startOf("month");
  return {
    cycleStart: startOfMonth.toDate(),
    cycleEnd: startOfMonth.clone().add(1, "month").toDate(),
  };
}

// Returns the bounds of the current billing cycle for the workspace, or the
// current calendar month if the workspace is not on a credit-based plan.
// If the billing cycle cannot be resolved, returns the current calendar month.
async function resolveCycleBounds(
  auth: Authenticator,
  now: Date
): Promise<{ cycleStart: Date; cycleEnd: Date }> {
  const plan = auth.plan();
  if (!plan || !isCreditPricedPlan(plan)) {
    return calendarMonthBounds(now);
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const periodResult =
    await getCachedMetronomeCurrentBillingPeriod(workspaceId);
  if (periodResult.isErr()) {
    logger.warn(
      { workspaceId, err: periodResult.error },
      "[ConsumptionAnalytics] Failed to resolve billing period, " +
        "falling back to the calendar month."
    );
    return calendarMonthBounds(now);
  }
  if (!periodResult.value) {
    return calendarMonthBounds(now);
  }

  return {
    cycleStart: periodResult.value.cycleStart,
    cycleEnd: periodResult.value.cycleEnd,
  };
}

// Filesystem-safe label for the resolved period, for naming CSV exports. The
// cycle's actual start date is included since "this cycle" on its own is
// ambiguous once the file has been downloaded.
export function consumptionPeriodFilenameSlug(
  input: ConsumptionPeriodInput,
  period: ConsumptionPeriod
): string {
  return input.kind === "days"
    ? `last_${input.days}_days`
    : `ongoing_cycle_date_${period.startDate.slice(0, 10)}`;
}

export async function resolveConsumptionPeriod(
  auth: Authenticator,
  input: ConsumptionPeriodInput
): Promise<ConsumptionPeriod> {
  const now = new Date();

  switch (input.kind) {
    case "cycle":
      const { cycleStart, cycleEnd } = await resolveCycleBounds(auth, now);
      return {
        startDate: cycleStart.toISOString(),
        endDate: cycleEnd.toISOString(),
      };
    case "days":
      const startMs = moment
        .utc(now)
        .subtract(input.days - 1, "days")
        .startOf("day")
        .valueOf();
      return {
        startDate: new Date(startMs).toISOString(),
        endDate: now.toISOString(),
      };
    default:
      assertNever(input);
  }
}
