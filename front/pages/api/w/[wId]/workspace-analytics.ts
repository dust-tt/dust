import type { NextApiRequest, NextApiResponse } from "next";
import { QueryTypes } from "sequelize";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { apiError } from "@app/logger/withlogging";
import type { APIErrorResponse } from "@app/types";

export type GetWorkspaceAnalyticsResponse = {
  memberCount: number;
  monthlyActiveUsers: {
    count: number;
    growth: number;
  };
  weeklyActiveUsers: {
    count: number;
    growth: number;
  };
  averageWeeklyDailyActiveUsers: {
    count: number;
    growth: number;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetWorkspaceAnalyticsResponse | APIErrorResponse>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can retrieve its monthly usage.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const analytics = await getAnalytics(req.query.wId as string);
      res.status(200).json(analytics);
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

interface MemberCountQueryResult {
  member_count: number;
}

interface ActiveUsersQueryResult {
  last_7_days_active_users: number;
  wow_growth_pct: number;
  last_30_days_active_users: number;
  mom_growth_pct: number;
}

interface AverageWeeklyDailyActiveUsersQueryResult {
  last_7_days_average_daily_active_users: number;
  wow_growth_pct: number;
}

async function getAnalytics(
  wId: string
): Promise<GetWorkspaceAnalyticsResponse> {
  const replicaDb = getFrontReplicaDbConnection();

  const [memberCountResults, activeUsersResult, averageWeeklyDauResult] =
    await Promise.all([
      replicaDb.query<MemberCountQueryResult>(
        `
      SELECT COUNT(DISTINCT "memberships"."userId") AS "member_count"
      FROM "memberships"
      JOIN "workspaces" ON "memberships"."workspaceId" = "workspaces"."id"
      WHERE "workspaces"."sId" = :wId
      AND "memberships"."startAt" <= NOW() AND ("memberships"."endAt" IS NULL OR "memberships"."endAt" >= NOW());
    `,
        {
          replacements: {
            wId,
          },
          type: QueryTypes.SELECT,
        }
      ),
      replicaDb.query<ActiveUsersQueryResult>(
        `
        WITH
          raw_counts AS (
            SELECT
              COUNT(
                DISTINCT (
                  CASE
                    WHEN "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '7 days' THEN "userId"
                    ELSE NULL
                  END
                )
              ) AS "nb_active_users_last_7_days",
              COUNT(
                DISTINCT (
                  CASE
                    WHEN "user_messages"."createdAt" < CURRENT_DATE - INTERVAL '7 days'
                    AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '14 days' THEN "userId"
                    ELSE NULL
                  END
                )
              ) AS "nb_active_users_previous_7_days",
              COUNT(
                DISTINCT (
                  CASE
                    WHEN "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '30 days' THEN "userId"
                    ELSE NULL
                  END
                )
              ) AS "nb_active_users_last_30_days",
              COUNT(
                DISTINCT (
                  CASE
                    WHEN "user_messages"."createdAt" < CURRENT_DATE - INTERVAL '30 days'
                    AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '60 days' THEN "userId"
                    ELSE NULL
                  END
                )
              ) AS "nb_active_users_previous_30_days"
            FROM
              "user_messages"
              JOIN "messages" ON "messages"."userMessageId" = "user_messages"."id"
              JOIN "conversations" ON "messages"."conversationId" = "conversations"."id"
              JOIN "workspaces" ON "conversations"."workspaceId" = "workspaces"."id"
            WHERE
              "workspaces"."sId" = :wId
              AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '60 days'
          ),
          calculations AS (
            SELECT
              "nb_active_users_last_7_days",
              CASE
                WHEN "nb_active_users_previous_7_days" = 0 THEN NULL
                ELSE (
                  "nb_active_users_last_7_days"::float - "nb_active_users_previous_7_days"::float
                ) / "nb_active_users_previous_7_days"::float
              END AS "wow_growth_pct",
              "nb_active_users_last_30_days",
              CASE
                WHEN "nb_active_users_previous_30_days" = 0 THEN NULL
                ELSE (
                  "nb_active_users_last_30_days"::float - "nb_active_users_previous_30_days"::float
                ) / "nb_active_users_previous_30_days"::float
              END AS "mom_growth_pct"
            FROM
              raw_counts
          )
        SELECT
          "nb_active_users_last_7_days",
          "wow_growth_pct",
          "nb_active_users_last_30_days",
          "mom_growth_pct"
        FROM
          calculations;
        `,
        {
          replacements: {
            wId,
          },
          type: QueryTypes.SELECT,
        }
      ),
      replicaDb.query<AverageWeeklyDailyActiveUsersQueryResult>(
        `
        WITH daily_activity AS (
          SELECT
            DATE("user_messages"."createdAt") AS day,
            COUNT(DISTINCT "user_messages"."userId") AS active_users
          FROM "user_messages"
          JOIN "messages" ON "messages"."userMessageId" = "user_messages"."id"
          JOIN "conversations" ON "messages"."conversationId" = "conversations"."id"
          JOIN "workspaces" ON "conversations"."workspaceId" = "workspaces"."id"
          WHERE "workspaces"."sId" = :wId
            AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '14 days'
          GROUP BY day
          HAVING COUNT("user_messages"."id") >= :messageCountThreshold
        ),
        averages AS (
          SELECT
            AVG(CASE WHEN day >= CURRENT_DATE - INTERVAL '7 days' THEN active_users END) AS current_avg_dau,
            AVG(CASE WHEN day < CURRENT_DATE - INTERVAL '7 days' AND day >= CURRENT_DATE - INTERVAL '14 days' THEN active_users END) AS previous_avg_dau
          FROM daily_activity
        ),
        wow_growth AS (
          SELECT
            COALESCE(current_avg_dau, 0) AS current_avg_dau,
            COALESCE(previous_avg_dau, 0) AS previous_avg_dau,
            CASE
              WHEN previous_avg_dau > 0 THEN (COALESCE(current_avg_dau, 0) - previous_avg_dau) / previous_avg_dau * 100
              ELSE NULL
            END AS wow_growth_pct
          FROM averages
        )
        SELECT
          ROUND(COALESCE(current_avg_dau, 0)::Decimal, 2) AS last_7_days_average_daily_active_users,
          ROUND(COALESCE(wow_growth_pct, 0)::Decimal, 2) AS wow_growth_pct
        FROM wow_growth;
      `,
        {
          replacements: {
            wId,
            messageCountThreshold: 1,
          },
          type: QueryTypes.SELECT,
        }
      ),
    ]);

  if (memberCountResults.length !== 1) {
    throw new Error("Unexpected number of results for member count query.");
  }
  if (activeUsersResult.length !== 1) {
    throw new Error("Unexpected number of results for active users query.");
  }
  if (averageWeeklyDauResult.length !== 1) {
    throw new Error(
      "Unexpected number of results for average weekly daily active users query."
    );
  }

  return {
    memberCount: memberCountResults[0].member_count,
    monthlyActiveUsers: {
      count: activeUsersResult[0].last_30_days_active_users,
      growth: activeUsersResult[0].mom_growth_pct * 100,
    },
    weeklyActiveUsers: {
      count: activeUsersResult[0].last_7_days_active_users,
      growth: activeUsersResult[0].wow_growth_pct * 100,
    },
    averageWeeklyDailyActiveUsers: {
      count: averageWeeklyDauResult[0].last_7_days_average_daily_active_users,
      growth: averageWeeklyDauResult[0].wow_growth_pct,
    },
  };
}
