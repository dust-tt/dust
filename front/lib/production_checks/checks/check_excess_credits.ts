import { Authenticator } from "@app/lib/auth";
import {
  getAnnualizedSubscriptionValueMicroUsd,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { QueryTypes } from "sequelize";

const EXCESS_ABSOLUTE_THRESHOLD_MICRO_USD = 10_000_000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const EXCESS_SUBSCRIPTION_PERCENTAGE_THRESHOLD = 5; // 5% of annual subscription
const EXCESS_ACTIVE_CREDITS_PERCENTAGE_THRESHOLD = 2; // 2% of active credits (fallback)

interface WorkspaceExcessCredits {
  workspaceId: number;
  workspaceSId: string;
  workspaceName: string;
  totalExcessMicroUsd: number;
}

interface WorkspaceThresholdData {
  annualSubscriptionValueMicroUsd: number | null;
  activeCreditsMicroUsd: number;
}

export const checkExcessCredits: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const frontDb = getFrontReplicaDbConnection();
  const thirtyDaysAgo = new Date(Date.now() - DAYS_30_MS);

  // Query for workspaces with excess credits above the absolute threshold in the last 30 days.
  const workspacesWithExcessCredits: WorkspaceExcessCredits[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      SELECT
        c."workspaceId" as "workspaceId",
        w."sId" as "workspaceSId",
        w."name" as "workspaceName",
        SUM(c."consumedAmountMicroUsd") as "totalExcessMicroUsd"
      FROM credits c
      JOIN workspaces w ON c."workspaceId" = w.id
      WHERE c."type" = 'excess'
        AND c."startDate" >= :thirtyDaysAgo
      GROUP BY c."workspaceId", w."sId", w."name"
      HAVING SUM(c."consumedAmountMicroUsd") > :threshold
      ORDER BY SUM(c."consumedAmountMicroUsd") DESC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          thirtyDaysAgo: thirtyDaysAgo.toISOString(),
          threshold: EXCESS_ABSOLUTE_THRESHOLD_MICRO_USD,
        },
      }
    );

  if (workspacesWithExcessCredits.length === 0) {
    reportSuccess();
    return;
  }

  // Fetch subscription and active credits data for workspaces that exceeded the absolute threshold.
  const thresholdDataByWorkspaceSId = new Map<string, WorkspaceThresholdData>();
  await concurrentExecutor(
    workspacesWithExcessCredits,
    async (workspace) => {
      const auth = await Authenticator.internalAdminForWorkspace(
        workspace.workspaceSId
      );

      // Fetch active credits.
      const activeCredits = await CreditResource.listActive(auth);
      const activeCreditsMicroUsd = activeCredits.reduce(
        (sum, c) => sum + c.initialAmountMicroUsd,
        0
      );

      // Fetch subscription and calculate annualized value if Stripe subscription exists.
      let annualSubscriptionValueMicroUsd: number | null = null;
      const subscription =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspace.workspaceId
        );

      if (subscription?.stripeSubscriptionId) {
        const stripeSubscription = await getStripeSubscription(
          subscription.stripeSubscriptionId
        );
        if (stripeSubscription) {
          annualSubscriptionValueMicroUsd =
            getAnnualizedSubscriptionValueMicroUsd(stripeSubscription);
        }
      }

      thresholdDataByWorkspaceSId.set(workspace.workspaceSId, {
        annualSubscriptionValueMicroUsd,
        activeCreditsMicroUsd,
      });
    },
    { concurrency: 10 }
  );

  // Filter to only include workspaces where excess exceeds the relative threshold.
  // For workspaces with Stripe subscription: use 5% of annual subscription value.
  // For workspaces without Stripe subscription: fallback to 2% of active credits.
  const significantExcessWorkspaces = workspacesWithExcessCredits.filter(
    (w) => {
      const thresholdData = thresholdDataByWorkspaceSId.get(w.workspaceSId);
      if (!thresholdData) {
        return true;
      }

      const { annualSubscriptionValueMicroUsd, activeCreditsMicroUsd } =
        thresholdData;

      // If workspace has a Stripe subscription, use subscription-based threshold.
      if (
        annualSubscriptionValueMicroUsd !== null &&
        annualSubscriptionValueMicroUsd > 0
      ) {
        const excessPercentage =
          (Number(w.totalExcessMicroUsd) / annualSubscriptionValueMicroUsd) *
          100;
        return excessPercentage > EXCESS_SUBSCRIPTION_PERCENTAGE_THRESHOLD;
      }

      // Fallback: use active credits threshold.
      if (activeCreditsMicroUsd === 0) {
        return true;
      }
      const excessPercentage =
        (Number(w.totalExcessMicroUsd) / activeCreditsMicroUsd) * 100;
      return excessPercentage > EXCESS_ACTIVE_CREDITS_PERCENTAGE_THRESHOLD;
    }
  );

  if (significantExcessWorkspaces.length > 0) {
    const formattedWorkspaces = significantExcessWorkspaces.map((w) => ({
      workspaceSId: w.workspaceSId,
      workspaceName: w.workspaceName,
      totalExcessUsd: (Number(w.totalExcessMicroUsd) / 1_000_000).toFixed(2),
    }));

    const actionLinks: ActionLink[] = significantExcessWorkspaces.map((w) => ({
      label: `${w.workspaceName} ($${(Number(w.totalExcessMicroUsd) / 1_000_000).toFixed(2)})`,
      url: `/poke/${w.workspaceSId}`,
    }));

    const thresholdDollars = EXCESS_ABSOLUTE_THRESHOLD_MICRO_USD / 1_000_000;
    const message =
      `${significantExcessWorkspaces.length} workspace(s) have excess credits > $${thresholdDollars} ` +
      `(and > ${EXCESS_SUBSCRIPTION_PERCENTAGE_THRESHOLD}% of annual subscription or ${EXCESS_ACTIVE_CREDITS_PERCENTAGE_THRESHOLD}% of active credits) in the last 30 days`;

    logger.warn({ workspaces: formattedWorkspaces }, message);

    reportFailure({ workspaces: formattedWorkspaces, actionLinks }, message);
  } else {
    reportSuccess();
  }
};
