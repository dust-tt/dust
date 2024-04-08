import { sendOpsEndingSubscriptionsEmail } from "@app/lib/email";
import { NON_ENTERPRISE_CODES } from "@app/lib/plans/plan_codes";
import { getActiveSubscriptionsAndWorkspaces } from "@app/lib/plans/subscription";

export async function warnExpiringEnterpriseSubscriptionsActivity() {
  // get all subscriptions with an end date in 7 or 14 days
  const activeSubscriptions = await getActiveSubscriptionsAndWorkspaces();

  const expiring7daysWorkspaces = activeSubscriptions
    .filter(({ subscription }) => {
      if (!subscription.endDate) return false;
      if (NON_ENTERPRISE_CODES.includes(subscription.plan.code)) return false;
      const daysUntilExpiration = Math.ceil(
        (subscription.endDate - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiration === 7;
    })
    .map(({ workspace }) => workspace);

  const expiring30daysWorkspaces = activeSubscriptions
    .filter(({ subscription }) => {
      if (!subscription.endDate) return false;
      if (NON_ENTERPRISE_CODES.includes(subscription.plan.code)) return false;
      const daysUntilExpiration = Math.ceil(
        (subscription.endDate - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiration === 30;
    })
    .map(({ workspace }) => workspace);

  if (
    expiring7daysWorkspaces.length > 0 ||
    expiring30daysWorkspaces.length > 0
  ) {
    await sendOpsEndingSubscriptionsEmail(
      expiring7daysWorkspaces,
      expiring30daysWorkspaces
    );
  }
}
