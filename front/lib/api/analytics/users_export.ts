import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  metricSubAgg,
  metricValue,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { getUserGroupMemberships } from "@app/lib/workspace_usage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";
import { Op } from "sequelize";

type TopUserExportBucket = {
  key: string;
  doc_count: number;
  last_message?: estypes.AggregationsMaxAggregate;
  active_days?: estypes.AggregationsDateHistogramAggregate;
  credits?: estypes.AggregationsSumAggregate;
};

type TopUsersExportAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<TopUserExportBucket>;
};

type ConsumptionTopUserExportBucket = {
  key: string;
  doc_count: number;
  unique_messages?: estypes.AggregationsCardinalityAggregate;
  last_message?: estypes.AggregationsMaxAggregate;
  active_days?: estypes.AggregationsDateHistogramAggregate;
  metric?: estypes.AggregationsSumAggregate;
};

type ConsumptionTopUsersExportAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<ConsumptionTopUserExportBucket>;
};

type UserEsMetrics = {
  messageCount: number;
  lastMessageSent: string;
  activeDaysCount: number;
  credits: number;
};

// `revoked` when the membership has ended, `unregistered` when the user never
// logged in, `active` otherwise.
type UserExportStatus = "active" | "revoked" | "unregistered";

export interface UserExportRow {
  userId: string;
  userName: string;
  userEmail: string;
  userStatus: UserExportStatus;
  lastLoginAt: string;
  messageCount: number;
  lastMessageSent: string;
  activeDaysCount: number;
  groups: string;
  credits: number;
}

export const USER_EXPORT_HEADERS: (keyof UserExportRow)[] = [
  "userId",
  "userName",
  "userEmail",
  "userStatus",
  "lastLoginAt",
  "messageCount",
  "lastMessageSent",
  "activeDaysCount",
  "groups",
  "credits",
];

export async function fetchUserExportRows({
  baseQuery,
  owner,
  startDate,
  endDate,
  timezone,
}: {
  baseQuery: estypes.QueryDslQueryContainer;
  owner: WorkspaceType;
  startDate: Date;
  endDate: Date;
  timezone: string;
}): Promise<Result<UserExportRow[], Error>> {
  const esResult = await searchAnalytics<never, TopUsersExportAggs>(
    {
      bool: {
        filter: [baseQuery],
      },
    },
    {
      aggregations: {
        by_user: {
          terms: { field: "user_id", size: 10000 },
          aggs: {
            last_message: { max: { field: "timestamp" } },
            active_days: {
              date_histogram: {
                field: "timestamp",
                calendar_interval: "day",
                min_doc_count: 1,
                time_zone: timezone,
              },
            },
            // Billed credits per execution via `cost.billable_awu` (0 for the
            // non-billable errored-terminal part), so no status filter is needed;
            // the count metrics above stay inclusive of all activity.
            credits: { sum: { field: "cost.billable_awu" } },
          },
        },
      },
      size: 0,
    }
  );

  if (esResult.isErr()) {
    return new Err(new Error(esResult.error.message));
  }

  const buckets = bucketsToArray<TopUserExportBucket>(
    esResult.value.aggregations?.by_user?.buckets
  );

  const esMetrics = new Map(
    buckets.map((b) => {
      const lastMessageMs = b.last_message?.value;
      const activeDaysBuckets = b.active_days?.buckets;
      return [
        String(b.key),
        {
          messageCount: b.doc_count,
          lastMessageSent:
            typeof lastMessageMs === "number"
              ? moment(lastMessageMs).tz(timezone).format("YYYY-MM-DD")
              : "",
          activeDaysCount: Array.isArray(activeDaysBuckets)
            ? activeDaysBuckets.filter((d) => d.doc_count > 0).length
            : 0,
          credits: Math.round(b.credits?.value ?? 0),
        },
      ] as const;
    })
  );

  const rows = await assembleUserExportRows({
    esMetrics,
    owner,
    startDate,
    endDate,
    timezone,
  });

  return new Ok(rows);
}

// Consumption-index counterpart of `fetchUserExportRows`, scoped to the
// `users` export table. "messageCount" becomes a distinct count since the
// index carries multiple documents per agent message.
export async function fetchConsumptionUserExportRows({
  auth,
  esStartDate,
  esEndDate,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  esStartDate: string;
  esEndDate: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
}): Promise<Result<UserExportRow[], Error>> {
  const owner = auth.getNonNullableWorkspace();
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: esStartDate,
    endDate: esEndDate,
  });

  const esResult = await searchConsumptionAnalytics<
    never,
    ConsumptionTopUsersExportAggs
  >(query, {
    aggregations: {
      by_user: {
        terms: { field: "user.id", size: 10000 },
        aggs: {
          unique_messages: {
            cardinality: {
              field: AGENT_MESSAGE_ID_FIELD,
              precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
            },
          },
          last_message: { max: { field: COMPLETED_AT_FIELD } },
          active_days: {
            date_histogram: {
              field: COMPLETED_AT_FIELD,
              calendar_interval: "day",
              min_doc_count: 1,
              time_zone: timezone,
            },
          },
          ...metricSubAgg("credit_micro"),
        },
      },
    },
    size: 0,
  });

  if (esResult.isErr()) {
    return new Err(new Error(esResult.error.message));
  }

  const buckets = bucketsToArray<ConsumptionTopUserExportBucket>(
    esResult.value.aggregations?.by_user?.buckets
  );

  const esMetrics = new Map<string, UserEsMetrics>(
    buckets.map((b) => {
      const lastMessageMs = b.last_message?.value;
      const activeDaysBuckets = b.active_days?.buckets;
      return [
        String(b.key),
        {
          messageCount: Math.round(b.unique_messages?.value ?? 0),
          lastMessageSent:
            typeof lastMessageMs === "number"
              ? moment(lastMessageMs).tz(timezone).format("YYYY-MM-DD")
              : "",
          activeDaysCount: Array.isArray(activeDaysBuckets)
            ? activeDaysBuckets.filter((d) => d.doc_count > 0).length
            : 0,
          credits: Math.round(metricValue("credit_micro", b.metric)),
        },
      ] as const;
    })
  );

  const rows = await assembleUserExportRows({
    esMetrics,
    owner,
    startDate,
    endDate,
    timezone,
  });

  return new Ok(rows);
}

async function assembleUserExportRows({
  esMetrics,
  owner,
  startDate,
  endDate,
  timezone,
}: {
  esMetrics: Map<string, UserEsMetrics>;
  owner: WorkspaceType;
  startDate: Date;
  endDate: Date;
  timezone: string;
}): Promise<UserExportRow[]> {
  // TODO(BACK5): Migrate to MembershipResource when it supports custom date range filters.
  const memberships = await MembershipModel.findAll({
    where: {
      workspaceId: owner.id,
      startAt: { [Op.lte]: endDate },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gte]: startDate } }],
    },
    include: [
      {
        model: UserModel,
        required: true,
        attributes: [
          "id",
          "sId",
          "firstName",
          "lastName",
          "email",
          "lastLoginAt",
        ],
      },
    ],
  });

  const groupsMap = await getUserGroupMemberships(owner.id, startDate, endDate);

  const now = new Date();

  const rows: UserExportRow[] = memberships.map((membership) => {
    const user = membership.user;
    const userId = user.sId;
    const metrics = esMetrics.get(userId);
    const userModelId = String(user.id);

    return {
      userId,
      userName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email ||
        "Unknown",
      userEmail: user.email ?? "",
      userStatus: getUserExportStatus({ membership, user, now }),
      lastLoginAt: user.lastLoginAt
        ? moment(user.lastLoginAt).tz(timezone).format("YYYY-MM-DD")
        : "",
      messageCount: metrics?.messageCount ?? 0,
      lastMessageSent: metrics?.lastMessageSent ?? "",
      activeDaysCount: metrics?.activeDaysCount ?? 0,
      groups: groupsMap[userModelId] ?? "",
      credits: metrics?.credits ?? 0,
    };
  });

  rows.sort((a, b) => b.messageCount - a.messageCount);

  return rows;
}

function getUserExportStatus({
  membership,
  user,
  now,
}: {
  membership: MembershipModel;
  user: UserModel;
  now: Date;
}): UserExportStatus {
  if (membership.endAt && membership.endAt < now) {
    return "revoked";
  }
  if (!user.lastLoginAt) {
    return "unregistered";
  }
  return "active";
}
