import type { APIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { QueryTypes } from "sequelize";

import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { frontSequelize } from "@app/lib/resources/storage";
import { apiError } from "@app/logger/withlogging";

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

export default withSessionAuthenticationForWorkspaceAsUser(handler);

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
  const [memberCountResults, activeUsersResult, averageWeeklyDauResult] =
    await Promise.all([
      frontSequelize.query<MemberCountQueryResult>(
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
      frontSequelize.query<ActiveUsersQueryResult>(
        `WITH activity_periods AS (
        SELECT
          "user_messages"."userId",
          COUNT(*) AS message_count,
          CASE
            WHEN "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '7 days' THEN 'last_7_days'
            WHEN "user_messages"."createdAt" < CURRENT_DATE - INTERVAL '7 days' AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '14 days' THEN 'previous_7_days'
            WHEN "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '30 days' THEN 'last_30_days'
            WHEN "user_messages"."createdAt" < CURRENT_DATE - INTERVAL '30 days' AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '60 days' THEN 'previous_30_days'
          END AS period
        FROM "user_messages"
        JOIN "messages" ON "messages"."userMessageId" = "user_messages"."id"
        JOIN "conversations" ON "messages"."conversationId" = "conversations"."id"
        JOIN "workspaces" ON "conversations"."workspaceId" = "workspaces"."id"
        WHERE "workspaces"."sId" = :wId
          AND "user_messages"."createdAt" >= CURRENT_DATE - INTERVAL '60 days'
        GROUP BY "user_messages"."userId", period
        HAVING COUNT(*) >= :messageCountThreshold
      ),
      aggregated_counts AS (
        SELECT
          period,
          COUNT("userId") AS active_users
        FROM activity_periods
        GROUP BY period
      ),
      growth_calculations AS (
        SELECT
          COALESCE(MAX(CASE WHEN period = 'last_7_days' THEN active_users END), 0) AS "last_7_days_active_users",
          COALESCE(MAX(CASE WHEN period IN ('last_30_days', 'last_7_days', 'previous_7_days') THEN active_users END), 0) AS "last_30_days_active_users",
          (COALESCE(MAX(CASE WHEN period = 'last_7_days' THEN active_users END), 0) - COALESCE(MAX(CASE WHEN period = 'previous_7_days' THEN active_users END), 0))::FLOAT
          / GREATEST(COALESCE(MAX(CASE WHEN period = 'previous_7_days' THEN active_users END), 1), 1) * 100 AS "wow_growth_pct",
          (COALESCE(MAX(CASE WHEN period IN ('last_30_days', 'last_7_days', 'previous_7_days') THEN active_users END), 0) - COALESCE(MAX(CASE WHEN period = 'previous_30_days' THEN active_users END), 0))::FLOAT
          / GREATEST(COALESCE(MAX(CASE WHEN period = 'previous_30_days' THEN active_users END), 1), 1) * 100 AS "mom_growth_pct"
        FROM aggregated_counts
      )
      SELECT
        "last_7_days_active_users",
        ROUND(wow_growth_pct::Decimal, 2) AS "wow_growth_pct",
        "last_30_days_active_users",
        ROUND(mom_growth_pct::Decimal, 2) AS "mom_growth_pct"
      FROM growth_calculations;
      `,
        {
          replacements: {
            wId,
            messageCountThreshold: 1,
          },
          type: QueryTypes.SELECT,
        }
      ),
      frontSequelize.query<AverageWeeklyDailyActiveUsersQueryResult>(
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
      growth: activeUsersResult[0].mom_growth_pct,
    },
    weeklyActiveUsers: {
      count: activeUsersResult[0].last_7_days_active_users,
      growth: activeUsersResult[0].wow_growth_pct,
    },
    averageWeeklyDailyActiveUsers: {
      count: averageWeeklyDauResult[0].last_7_days_average_daily_active_users,
      growth: averageWeeklyDauResult[0].wow_growth_pct,
    },
  };
}
