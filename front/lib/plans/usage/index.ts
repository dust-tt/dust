import type { LightWorkspaceType, Result } from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import type Stripe from "stripe";

import { reportActiveSeats } from "@app/lib/plans/stripe";
import { reportMonthlyActiveUsers } from "@app/lib/plans/usage/mau";
import type {
  InvalidRecurringPriceError,
  SupportedReportUsage,
} from "@app/lib/plans/usage/types";
import {
  InvalidReportUsageError,
  isSupportedReportUsage,
  REPORT_USAGE_METADATA_KEY,
} from "@app/lib/plans/usage/types";

function getUsageToReportForSubscriptionItem(
  item: Stripe.SubscriptionItem
): Result<SupportedReportUsage | null, InvalidReportUsageError> {
  const usageToReport = item.price.metadata[REPORT_USAGE_METADATA_KEY];

  if (!usageToReport) {
    return new Ok(null);
  }

  if (isSupportedReportUsage(usageToReport)) {
    return new Ok(usageToReport);
  }

  return new Err(new InvalidReportUsageError());
}

export async function reportUsageForSubscriptionItems(
  stripeSubscription: Stripe.Subscription,
  workspace: LightWorkspaceType
): Promise<
  Result<undefined, InvalidRecurringPriceError | InvalidReportUsageError>
> {
  const { data: subscriptionItems } = stripeSubscription.items;

  for (const item of subscriptionItems) {
    const usageToReportRes = getUsageToReportForSubscriptionItem(item);
    if (usageToReportRes.isErr()) {
      return new Err(usageToReportRes.error);
    }

    const usageToReport = usageToReportRes.value;
    if (!usageToReport) {
      return new Ok(undefined);
    }

    switch (usageToReport) {
      case "MAU_1":
      case "MAU_5":
      case "MAU_10":
        const res = await reportMonthlyActiveUsers(
          stripeSubscription,
          item,
          workspace,
          usageToReport
        );

        if (res.isErr()) {
          return res;
        }

        break;

      case "PER_SEAT":
        await reportActiveSeats(item, workspace);
        break;

      case "FIXED":
        // fixed price, nothing to report
        break;

      default:
        assertNever(usageToReport);
    }
  }

  return new Ok(undefined);
}
