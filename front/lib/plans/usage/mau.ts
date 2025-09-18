import { QueryTypes } from "sequelize";
import type Stripe from "stripe";

import {
  assertStripeSubscriptionItemIsValid,
  updateStripeActiveUsersForSubscriptionItem,
} from "@app/lib/plans/stripe";
import type { MauReportUsageType } from "@app/lib/plans/usage/types";
import { InvalidRecurringPriceError } from "@app/lib/plans/usage/types";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

async function countActiveUsersForPeriodInWorkspace({
  messagesPerMonthForMau,
  since,
  to,
  workspace,
}: {
  messagesPerMonthForMau: number;
  since: Date;
  to?: Date;
  workspace: LightWorkspaceType;
}): Promise<number> {
  // Use the replica database to compute this avoid impacting production performances.
  const result = await getFrontReplicaDbConnection().query(
    `
    SELECT "user_messages"."userId", COUNT(mentions.id) AS count
    FROM messages
    INNER JOIN user_messages ON messages."userMessageId" = user_messages.id
    INNER JOIN mentions ON mentions."messageId" = messages.id
    WHERE messages."workspaceId" = :workspaceId
    AND "user_messages"."userId" IS NOT NULL
    AND "user_messages"."userContextOrigin" != 'run_agent'
    AND "user_messages"."userContextOrigin" != 'agent_handover'
    AND "mentions"."createdAt" BETWEEN :startDate AND :endDate
    GROUP BY "user_messages"."userId"
    HAVING COUNT(mentions.*) >= :minNumberOfRows
  `,
    {
      replacements: {
        workspaceId: workspace.id,
        startDate: since,
        endDate: to ?? new Date(),
        minNumberOfRows: messagesPerMonthForMau,
      },
      type: QueryTypes.SELECT,
    }
  );

  return result.length;
}

export async function reportMonthlyActiveUsers(
  stripeSubscription: Stripe.Subscription,
  stripeSubscriptionItem: Stripe.SubscriptionItem,
  workspace: LightWorkspaceType,
  usage: MauReportUsageType
): Promise<Result<undefined, InvalidRecurringPriceError>> {
  const [, rawMessagesPerMonthForMau] = usage.split("_");
  const messagesPerMonthForMau = parseInt(rawMessagesPerMonthForMau, 10);

  const subscriptionItemValid = assertStripeSubscriptionItemIsValid({
    item: stripeSubscriptionItem,
    recurringRequired: true,
  });

  if (subscriptionItemValid.isErr()) {
    return new Err(
      new InvalidRecurringPriceError(
        subscriptionItemValid.error.invalidity_message
      )
    );
  }

  const activeUsers = await countActiveUsersForPeriodInWorkspace({
    messagesPerMonthForMau,
    since: new Date(stripeSubscription.current_period_start * 1000),
    to: new Date(stripeSubscription.current_period_end * 1000),
    workspace,
  });

  await updateStripeActiveUsersForSubscriptionItem(
    stripeSubscriptionItem,
    activeUsers
  );

  return new Ok(undefined);
}
