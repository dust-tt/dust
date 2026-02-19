import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { getUsageToReportForSubscriptionItem } from "@app/lib/plans/usage";
import { isMauReportUsage } from "@app/lib/plans/usage/types";
import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { QueryTypes } from "sequelize";

interface WorkspaceWithSubscription {
  workspaceId: number;
  workspaceSId: string;
  workspaceName: string;
  planCode: string;
  stripeSubscriptionId: string | null;
  activeMembershipCount: number;
  activeUsersByMessagesCount: number;
}

interface WorkspaceMismatch {
  workspaceId: number;
  workspaceSId: string;
  workspaceName: string;
  activeMembershipCount: number;
  activeUsersByMessagesCount: number;
}

export const checkMembershipActiveUsersConsistency: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const frontDb = getFrontReplicaDbConnection();

  // Query workspaces with active subscriptions and their membership/user counts
  const workspaces: WorkspaceWithSubscription[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      WITH active_memberships AS (
        SELECT
          m."workspaceId",
          COUNT(DISTINCT m."userId")::int as "activeMembershipCount"
        FROM memberships m
        WHERE m."firstUsedAt" IS NOT NULL
          AND m."endAt" IS NULL
        GROUP BY m."workspaceId"
      ),
      users_with_messages AS (
        SELECT
          msg."workspaceId",
          COUNT(DISTINCT um."userId")::int as "activeUsersByMessagesCount"
        FROM messages msg
        JOIN user_messages um ON msg."userMessageId" = um.id
        GROUP BY msg."workspaceId"
      )
      SELECT
        w.id as "workspaceId",
        w."sId" as "workspaceSId",
        w."name" as "workspaceName",
        p."code" as "planCode",
        s."stripeSubscriptionId",
        COALESCE(am."activeMembershipCount", 0) as "activeMembershipCount",
        COALESCE(uwm."activeUsersByMessagesCount", 0) as "activeUsersByMessagesCount"
      FROM workspaces w
      JOIN subscriptions s ON w.id = s."workspaceId" AND s."status" = 'active'
      JOIN plans p ON s."planId" = p.id
      LEFT JOIN active_memberships am ON w.id = am."workspaceId"
      LEFT JOIN users_with_messages uwm ON w.id = uwm."workspaceId"
      WHERE COALESCE(am."activeMembershipCount", 0) <> COALESCE(uwm."activeUsersByMessagesCount", 0)
      ORDER BY ABS(COALESCE(am."activeMembershipCount", 0) - COALESCE(uwm."activeUsersByMessagesCount", 0)) DESC
      LIMIT 200
      `,
      { type: QueryTypes.SELECT }
    );

  if (workspaces.length === 0) {
    reportSuccess();
    return;
  }

  heartbeat();

  // Filter out MAU-billed enterprise workspaces
  const mismatchedWorkspaces: WorkspaceMismatch[] = [];

  await concurrentExecutor(
    workspaces,
    async (workspace) => {
      // For enterprise plans with a Stripe subscription, check if it's MAU billing
      if (
        isEntreprisePlanPrefix(workspace.planCode) &&
        workspace.stripeSubscriptionId
      ) {
        const stripeSubscription = await getStripeSubscription(
          workspace.stripeSubscriptionId
        );

        if (stripeSubscription) {
          const activeItems = stripeSubscription.items.data.filter(
            (item) => !item.deleted
          );

          const hasMauBilling = activeItems.some((item) => {
            const usageRes = getUsageToReportForSubscriptionItem(item);
            return (
              usageRes.isOk() &&
              usageRes.value !== null &&
              isMauReportUsage(usageRes.value)
            );
          });

          if (hasMauBilling) {
            logger.info(
              {
                workspaceSId: workspace.workspaceSId,
                planCode: workspace.planCode,
              },
              "Skipping MAU-billed enterprise workspace"
            );
            return;
          }
        }
      }

      mismatchedWorkspaces.push({
        workspaceId: workspace.workspaceId,
        workspaceSId: workspace.workspaceSId,
        workspaceName: workspace.workspaceName,
        activeMembershipCount: workspace.activeMembershipCount,
        activeUsersByMessagesCount: workspace.activeUsersByMessagesCount,
      });
    },
    { concurrency: 10 }
  );

  if (mismatchedWorkspaces.length === 0) {
    reportSuccess();
    return;
  }

  const actionLinks: ActionLink[] = mismatchedWorkspaces
    .slice(0, 20)
    .map((w) => ({
      label: `${w.workspaceName} (seats: ${w.activeMembershipCount}, users: ${w.activeUsersByMessagesCount})`,
      url: `/poke/${w.workspaceSId}`,
    }));

  logger.warn(
    { workspaces: mismatchedWorkspaces },
    `${mismatchedWorkspaces.length} workspace(s) have membership/active-user count mismatches`
  );

  reportFailure(
    { workspaces: mismatchedWorkspaces, actionLinks },
    `${mismatchedWorkspaces.length} workspace(s) have active membership count different from users with messages`
  );
};
