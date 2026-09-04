/**
 * Compare the per-user AWU values returned by the legacy and consumption
 * analytics indices for a workspace's current billing cycle.
 *
 * npx tsx migrations/20260904_compare_per_user_usage_indices.ts \
 *   --workspaceId <wId>
 */
import {
  ANALYTICS_ALIAS_NAME,
  bucketsToArray,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { Authenticator } from "@app/lib/auth";
import { toFreeMetronomeUserId } from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { MembershipSeatType } from "@app/types/memberships";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";
import chunk from "lodash/chunk";

const COMPOSITE_PAGE_SIZE = 1_000;
const USER_ID_BATCH_SIZE = 5_000;
const STATUS_BUCKET_SIZE = 10;
const MISMATCH_SAMPLE_LIMIT = 20;

type UserCompositeKey = {
  user_id: string;
};

type CreditsFilterAggregate = {
  doc_count: number;
  credits?: estypes.AggregationsSumAggregate;
};

type StatusCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type StatusCreditsAggregate =
  estypes.AggregationsTermsAggregateBase<StatusCreditsBucket>;

type LegacyUserCreditsBucket = {
  key: UserCompositeKey;
  paid_credits?: CreditsFilterAggregate;
  free_credits?: CreditsFilterAggregate;
  by_status?: StatusCreditsAggregate;
};

type ConsumptionUserCreditsBucket = {
  key: UserCompositeKey;
  credits?: estypes.AggregationsSumAggregate;
  by_status?: StatusCreditsAggregate;
  by_usage_type?: StatusCreditsAggregate;
};

type UserCreditsAggregations<TBucket> = {
  by_user?: {
    after_key?: UserCompositeKey;
    buckets: TBucket[];
  };
};

type LegacyUserCredits = {
  paidAwuCredits: number;
  freeAwuCredits: number;
  awuCreditsByStatus: Record<string, number>;
};

type ConsumptionUserCredits = {
  creditMicro: number;
  awuCreditsByStatus: Record<string, number>;
  awuCreditsByUsageType: Record<string, number>;
};

type ActiveUser = {
  userId: string;
  seatType: MembershipSeatType;
};

async function fetchMetronomeUserCredits({
  activeUsers,
  metronomeCustomerId,
  workspaceId,
}: {
  activeUsers: ActiveUser[];
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Map<string, number>> {
  const metronomeUserIdByUserId = new Map(
    activeUsers.map(({ seatType, userId }) => [
      userId,
      seatType === "free" ? toFreeMetronomeUserId(userId) : userId,
    ])
  );
  const result = await fetchPerUserAwuUsage({
    workspaceId,
    metronomeCustomerId,
    userIds: [...metronomeUserIdByUserId.values()],
  });
  if (result.isErr()) {
    throw result.error;
  }

  const creditsByUserId = new Map<string, number>();
  for (const { userId } of activeUsers) {
    const metronomeUserId = metronomeUserIdByUserId.get(userId)!;
    creditsByUserId.set(userId, result.value.get(metronomeUserId) ?? 0);
  }
  return creditsByUserId;
}

function legacyCreditsByStatus(
  aggregation: StatusCreditsAggregate | undefined
): Record<string, number> {
  return Object.fromEntries(
    bucketsToArray<StatusCreditsBucket>(aggregation?.buckets).map((bucket) => [
      String(bucket.key),
      bucket.credits?.value ?? 0,
    ])
  );
}

function consumptionCreditsByValue(
  aggregation: StatusCreditsAggregate | undefined
): Record<string, number> {
  return Object.fromEntries(
    bucketsToArray<StatusCreditsBucket>(aggregation?.buckets).map((bucket) => [
      String(bucket.key),
      microCreditsToCredits(Math.round(bucket.credits?.value ?? 0)),
    ])
  );
}

function sumCreditsByValue(
  creditsByValue: Array<Record<string, number>>
): Record<string, number> {
  const totals = new Map<string, number>();
  for (const credits of creditsByValue) {
    for (const [value, amount] of Object.entries(credits)) {
      totals.set(value, (totals.get(value) ?? 0) + amount);
    }
  }
  return Object.fromEntries(
    [...totals.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

async function fetchLegacyUserCredits({
  cycleEnd,
  cycleStart,
  userIds,
  workspaceId,
}: {
  cycleEnd: Date;
  cycleStart: Date;
  userIds: string[];
  workspaceId: string;
}): Promise<Map<string, LegacyUserCredits>> {
  const creditsByUserId = new Map<string, LegacyUserCredits>();

  for (const userIdBatch of chunk(userIds, USER_ID_BATCH_SIZE)) {
    let afterKey: UserCompositeKey | undefined;
    do {
      const result = await searchAnalytics<
        never,
        UserCreditsAggregations<LegacyUserCreditsBucket>
      >(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspaceId } },
              { terms: { user_id: userIdBatch } },
              {
                range: {
                  timestamp: {
                    gte: cycleStart.toISOString(),
                    lte: cycleEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          aggregations: {
            by_user: {
              composite: {
                size: COMPOSITE_PAGE_SIZE,
                sources: [{ user_id: { terms: { field: "user_id" } } }],
                ...(afterKey ? { after: afterKey } : {}),
              },
              aggs: {
                paid_credits: {
                  filter: {
                    bool: { must_not: [{ term: { is_free_seat: true } }] },
                  },
                  aggs: { credits: { sum: { field: "cost.billable_awu" } } },
                },
                free_credits: {
                  filter: { term: { is_free_seat: true } },
                  aggs: { credits: { sum: { field: "cost.billable_awu" } } },
                },
                by_status: {
                  terms: { field: "status", size: STATUS_BUCKET_SIZE },
                  aggs: { credits: { sum: { field: "cost.billable_awu" } } },
                },
              },
            },
          },
          size: 0,
        }
      );
      if (result.isErr()) {
        throw new Error(
          `Failed to query ${ANALYTICS_ALIAS_NAME}: ${result.error.message}`
        );
      }

      const aggregation = result.value.aggregations?.by_user;
      const buckets = aggregation?.buckets ?? [];
      for (const bucket of buckets) {
        creditsByUserId.set(bucket.key.user_id, {
          paidAwuCredits: bucket.paid_credits?.credits?.value ?? 0,
          freeAwuCredits: bucket.free_credits?.credits?.value ?? 0,
          awuCreditsByStatus: legacyCreditsByStatus(bucket.by_status),
        });
      }
      afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
    } while (afterKey);
  }

  return creditsByUserId;
}

async function fetchConsumptionUserCredits({
  cycleEnd,
  cycleStart,
  userIds,
  workspaceId,
}: {
  cycleEnd: Date;
  cycleStart: Date;
  userIds: string[];
  workspaceId: string;
}): Promise<Map<string, ConsumptionUserCredits>> {
  const creditsByUserId = new Map<string, ConsumptionUserCredits>();

  for (const userIdBatch of chunk(userIds, USER_ID_BATCH_SIZE)) {
    let afterKey: UserCompositeKey | undefined;
    do {
      const result = await searchConsumptionAnalytics<
        never,
        UserCreditsAggregations<ConsumptionUserCreditsBucket>
      >(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspaceId } },
              { terms: { "user.id": userIdBatch } },
              {
                range: {
                  completed_at: {
                    gte: cycleStart.toISOString(),
                    lte: cycleEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          aggregations: {
            by_user: {
              composite: {
                size: COMPOSITE_PAGE_SIZE,
                sources: [{ user_id: { terms: { field: "user.id" } } }],
                ...(afterKey ? { after: afterKey } : {}),
              },
              aggs: {
                credits: { sum: { field: "credit_micro" } },
                by_status: {
                  terms: { field: "status", size: STATUS_BUCKET_SIZE },
                  aggs: { credits: { sum: { field: "credit_micro" } } },
                },
                by_usage_type: {
                  terms: { field: "usage_type", size: STATUS_BUCKET_SIZE },
                  aggs: { credits: { sum: { field: "credit_micro" } } },
                },
              },
            },
          },
          size: 0,
        }
      );
      if (result.isErr()) {
        throw new Error(
          `Failed to query ${CONSUMPTION_ANALYTICS_ALIAS_NAME}: ${result.error.message}`
        );
      }

      const aggregation = result.value.aggregations?.by_user;
      const buckets = aggregation?.buckets ?? [];
      for (const bucket of buckets) {
        creditsByUserId.set(bucket.key.user_id, {
          creditMicro: Math.round(bucket.credits?.value ?? 0),
          awuCreditsByStatus: consumptionCreditsByValue(bucket.by_status),
          awuCreditsByUsageType: consumptionCreditsByValue(
            bucket.by_usage_type
          ),
        });
      }
      afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
    } while (afterKey);
  }

  return creditsByUserId;
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      description: "Workspace sId to compare.",
      type: "string" as const,
    },
  },
  async ({ workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const periodResult = await getCachedMetronomeCurrentBillingPeriod(
      workspace.sId
    );
    if (periodResult.isErr()) {
      throw periodResult.error;
    }
    if (!periodResult.value) {
      throw new Error(
        `No current billing period for workspace: ${workspaceId}`
      );
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const authWorkspace = auth.getNonNullableWorkspace();
    const membershipsResult = await MembershipResource.getActiveMemberships({
      workspace: authWorkspace,
    });
    const { memberships } = membershipsResult;
    const userModelIds = [...new Set(memberships.map(({ userId }) => userId))];
    const users = await UserResource.fetchByModelIds(userModelIds);
    const userByModelId = new Map(users.map((user) => [user.id, user]));
    const activeUsers = removeNulls<ActiveUser>(
      memberships.map((membership) => {
        const user = userByModelId.get(membership.userId);
        return user
          ? { userId: user.sId, seatType: membership.seatType }
          : null;
      })
    );

    if (activeUsers.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId },
        "No active users found for per-user analytics comparison"
      );
      return;
    }

    const { cycleEnd, cycleStart } = periodResult.value;
    const userIds = activeUsers.map(({ userId }) => userId);
    const legacyCreditsByUserId = await fetchLegacyUserCredits({
      cycleEnd,
      cycleStart,
      userIds,
      workspaceId: workspace.sId,
    });
    const consumptionCreditsByUserId = await fetchConsumptionUserCredits({
      cycleEnd,
      cycleStart,
      userIds,
      workspaceId: workspace.sId,
    });
    if (!workspace.metronomeCustomerId) {
      throw new Error(
        `No Metronome customer configured for workspace: ${workspaceId}`
      );
    }
    const metronomeCreditsByUserId = await fetchMetronomeUserCredits({
      activeUsers,
      metronomeCustomerId: workspace.metronomeCustomerId,
      workspaceId: workspace.sId,
    });

    const comparisons = activeUsers.map(({ seatType, userId }) => {
      const legacy = legacyCreditsByUserId.get(userId);
      const consumption = consumptionCreditsByUserId.get(userId);
      const metronomeAwuCredits = metronomeCreditsByUserId.get(userId) ?? 0;
      const legacySelectedAwuCredits =
        seatType === "free"
          ? (legacy?.freeAwuCredits ?? 0)
          : (legacy?.paidAwuCredits ?? 0);
      const legacySelectedMicroCredits = roundCreditsToMicroCredits(
        legacySelectedAwuCredits
      );
      const consumptionMicroCredits = consumption?.creditMicro ?? 0;
      const legacyConsumerAwuCredits = Math.round(legacySelectedAwuCredits);
      const consumptionConsumerAwuCredits = Math.round(
        microCreditsToCredits(consumptionMicroCredits)
      );
      const metronomeConsumerAwuCredits = Math.round(metronomeAwuCredits);

      return {
        userId,
        seatType,
        legacyConsumerAwuCredits,
        consumptionConsumerAwuCredits,
        metronomeConsumerAwuCredits,
        consumerAwuCreditsDifference:
          consumptionConsumerAwuCredits - legacyConsumerAwuCredits,
        consumptionMetronomeAwuCreditsDifference:
          consumptionConsumerAwuCredits - metronomeConsumerAwuCredits,
        legacyMetronomeAwuCreditsDifference:
          legacyConsumerAwuCredits - metronomeConsumerAwuCredits,
        exactMicroCreditsDifference:
          consumptionMicroCredits - legacySelectedMicroCredits,
        exactAwuCreditsDifference: microCreditsToCredits(
          consumptionMicroCredits - legacySelectedMicroCredits
        ),
        legacy: {
          selectedAwuCredits: legacySelectedAwuCredits,
          paidAwuCredits: legacy?.paidAwuCredits ?? 0,
          freeAwuCredits: legacy?.freeAwuCredits ?? 0,
          awuCreditsByStatus: legacy?.awuCreditsByStatus ?? {},
        },
        consumption: {
          awuCredits: microCreditsToCredits(consumptionMicroCredits),
          awuCreditsByStatus: consumption?.awuCreditsByStatus ?? {},
          awuCreditsByUsageType: consumption?.awuCreditsByUsageType ?? {},
        },
        metronome: {
          awuCredits: metronomeAwuCredits,
        },
      };
    });

    const consumerMismatches = comparisons
      .filter(
        ({ consumerAwuCreditsDifference }) => consumerAwuCreditsDifference !== 0
      )
      .sort(
        (left, right) =>
          Math.abs(right.consumerAwuCreditsDifference) -
          Math.abs(left.consumerAwuCreditsDifference)
      );
    const exactMismatches = comparisons.filter(
      ({ exactMicroCreditsDifference }) => exactMicroCreditsDifference !== 0
    );
    const consumptionMetronomeMismatches = comparisons
      .filter(
        ({ consumptionMetronomeAwuCreditsDifference }) =>
          consumptionMetronomeAwuCreditsDifference !== 0
      )
      .sort(
        (left, right) =>
          Math.abs(right.consumptionMetronomeAwuCreditsDifference) -
          Math.abs(left.consumptionMetronomeAwuCreditsDifference)
      );
    const legacyMetronomeMismatches = comparisons.filter(
      ({ legacyMetronomeAwuCreditsDifference }) =>
        legacyMetronomeAwuCreditsDifference !== 0
    );
    const seatSplitUsers = comparisons.filter(
      ({ legacy }) => legacy.paidAwuCredits !== 0 && legacy.freeAwuCredits !== 0
    );
    const legacyConsumerAwuCredits = comparisons.reduce(
      (total, comparison) => total + comparison.legacyConsumerAwuCredits,
      0
    );
    const consumptionConsumerAwuCredits = comparisons.reduce(
      (total, comparison) => total + comparison.consumptionConsumerAwuCredits,
      0
    );
    const metronomeConsumerAwuCredits = comparisons.reduce(
      (total, comparison) => total + comparison.metronomeConsumerAwuCredits,
      0
    );
    const summary = {
      workspaceId: workspace.sId,
      cycleStart: cycleStart.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
      comparedUsers: comparisons.length,
      usersWithLegacyUsage: legacyCreditsByUserId.size,
      usersWithConsumptionUsage: consumptionCreditsByUserId.size,
      usersWithMetronomeUsage: [...metronomeCreditsByUserId.values()].filter(
        (credits) => credits !== 0
      ).length,
      exactMismatchCount: exactMismatches.length,
      consumerMismatchCount: consumerMismatches.length,
      consumptionMetronomeMismatchCount: consumptionMetronomeMismatches.length,
      legacyMetronomeMismatchCount: legacyMetronomeMismatches.length,
      legacySeatSplitUserCount: seatSplitUsers.length,
      legacyConsumerAwuCredits,
      consumptionConsumerAwuCredits,
      metronomeConsumerAwuCredits,
      consumptionLegacyAwuCreditsDifference:
        consumptionConsumerAwuCredits - legacyConsumerAwuCredits,
      consumptionMetronomeAwuCreditsDifference:
        consumptionConsumerAwuCredits - metronomeConsumerAwuCredits,
      legacyMetronomeAwuCreditsDifference:
        legacyConsumerAwuCredits - metronomeConsumerAwuCredits,
      legacyAwuCreditsByStatus: sumCreditsByValue(
        comparisons.map(({ legacy }) => legacy.awuCreditsByStatus)
      ),
      consumptionAwuCreditsByStatus: sumCreditsByValue(
        comparisons.map(({ consumption }) => consumption.awuCreditsByStatus)
      ),
      consumptionAwuCreditsByUsageType: sumCreditsByValue(
        comparisons.map(({ consumption }) => consumption.awuCreditsByUsageType)
      ),
      mismatchSampleLimit: MISMATCH_SAMPLE_LIMIT,
      mismatchSamples: consumerMismatches.slice(0, MISMATCH_SAMPLE_LIMIT),
      consumptionMetronomeMismatchSamples: consumptionMetronomeMismatches.slice(
        0,
        MISMATCH_SAMPLE_LIMIT
      ),
    };

    if (consumptionMetronomeMismatches.length > 0) {
      logger.error(
        summary,
        "Consumption analytics per-user usage differs from Metronome"
      );
      return;
    }

    logger.info(
      summary,
      "Consumption analytics per-user usage matches Metronome"
    );
  }
);
