import {
  AGENT_MESSAGE_ID_FIELD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import {
  assertStripeSubscriptionItemIsValid,
  updateStripeActiveUsersForSubscriptionItem,
} from "@app/lib/plans/stripe";
import type { MauReportUsageType } from "@app/lib/plans/usage/types";
import { InvalidRecurringPriceError } from "@app/lib/plans/usage/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import type Stripe from "stripe";

const ACTIVE_USERS_PAGE_SIZE = 1_000;

type ActiveUsersAggregations = {
  users: {
    after_key?: { user: string };
    buckets: {
      key: { user: string };
      messages: { buckets: { key: string }[] };
    }[];
  };
};

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
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspace.sId } },
        {
          range: {
            [COMPLETED_AT_FIELD]: {
              gte: since.toISOString(),
              lt: (to ?? new Date()).toISOString(),
            },
          },
        },
      ],
      // Exclude subagent responses so they don't inflate the user's message count.
      must_not: [{ exists: { field: "parent_message_id" } }],
    },
  };

  let activeUsers = 0;
  let afterKey: { user: string } | undefined;
  do {
    const result = await searchConsumptionAnalytics<
      never,
      ActiveUsersAggregations
    >(query, {
      size: 0,
      aggregations: {
        users: {
          composite: {
            size: ACTIVE_USERS_PAGE_SIZE,
            sources: [
              { user: { terms: { field: CONSUMPTION_DIMENSION_FIELDS.user } } },
            ],
            ...(afterKey ? { after: afterKey } : {}),
          },
          aggs: {
            // Only need enough distinct responses to reach the plan's 1/5/10 threshold.
            // Terms buckets avoid approximate cardinality in billing decisions.
            messages: {
              terms: {
                field: AGENT_MESSAGE_ID_FIELD,
                size: messagesPerMonthForMau,
                order: { _key: "asc" },
              },
            },
          },
        },
      },
    });
    if (result.isErr()) {
      throw result.error;
    }
    const { aggregations, timed_out, _shards } = result.value;
    if (timed_out || _shards.failed > 0 || !aggregations?.users) {
      throw new ElasticsearchError(
        "query_error",
        "Incomplete Elasticsearch response while counting monthly active users"
      );
    }

    const { buckets, after_key } = aggregations.users;
    activeUsers += buckets.filter(
      (bucket) => bucket.messages.buckets.length >= messagesPerMonthForMau
    ).length;
    afterKey = buckets.length > 0 ? after_key : undefined;
  } while (afterKey);

  return activeUsers;
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
