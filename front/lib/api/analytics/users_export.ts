import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
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
};

type TopUsersExportAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<TopUserExportBucket>;
};

export interface UserExportRow {
  userId: string;
  userName: string;
  userEmail: string;
  messageCount: number;
  lastMessageSent: string;
  activeDaysCount: number;
  groups: string;
}

export const USER_EXPORT_HEADERS: (keyof UserExportRow)[] = [
  "userId",
  "userName",
  "userEmail",
  "messageCount",
  "lastMessageSent",
  "activeDaysCount",
  "groups",
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
                time_zone: timezone,
              },
            },
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
        },
      ] as const;
    })
  );

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
        attributes: ["id", "sId", "firstName", "lastName", "email"],
      },
    ],
  });

  const groupsMap = await getUserGroupMemberships(owner.id, startDate, endDate);

  const rows: UserExportRow[] = memberships.map((membership) => {
    const user = membership.user;
    const userSid = user.sId;
    const metrics = esMetrics.get(userSid);
    const userId = String(user.id);

    return {
      userId: userSid,
      userName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email ||
        "Unknown",
      userEmail: user.email ?? "",
      messageCount: metrics?.messageCount ?? 0,
      lastMessageSent: metrics?.lastMessageSent ?? "",
      activeDaysCount: metrics?.activeDaysCount ?? 0,
      groups: groupsMap[userId] ?? "",
    };
  });

  rows.sort((a, b) => b.messageCount - a.messageCount);

  return new Ok(rows);
}
