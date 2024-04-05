import type { LightWorkspaceType, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { QueryTypes } from "sequelize";
import type Stripe from "stripe";

import { updateStripeActiveUsersForSubscriptionItem } from "@app/lib/plans/stripe";
import type { MauReportUsageType } from "@app/lib/plans/usage/types";
import { InvalidRecurringPriceError } from "@app/lib/plans/usage/types";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";

export async function getActiveUsersInWorkspaceForPeriod({
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
    INNER JOIN conversations ON messages."conversationId" = conversations.id
    INNER JOIN user_messages ON messages."userMessageId" = user_messages.id
    INNER JOIN mentions ON mentions."messageId" = messages.id
    WHERE conversations."workspaceId" = :workspaceId
    AND "user_messages"."userId" IS NOT NULL
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

  const { recurring } = stripeSubscriptionItem.price;
  if (!recurring) {
    return new Err(
      new InvalidRecurringPriceError(
        "MAU Usage base price only supports prices with monthly recurring."
      )
    );
  }

  const { interval, interval_count: intervalCount } = recurring;
  if (interval !== "month" || intervalCount !== 1) {
    return new Err(
      new InvalidRecurringPriceError(
        `Expected 1 month recurring, found ${intervalCount} ${interval}(s) instead.`
      )
    );
  }

  const activeUsers = await getActiveUsersInWorkspaceForPeriod({
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
