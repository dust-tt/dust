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
      const analytics = await getAnalytics(auth);
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

async function getAnalytics(
  auth: Authenticator
): Promise<GetWorkspaceAnalyticsResponse> {
  const replicaDb = getFrontReplicaDbConnection();

  // eslint-disable-next-line dust/no-raw-sql -- Legit, we need to run a complex query here.
  const results = await replicaDb.query<{
    member_count: number;
    weekly_active: number;
    monthly_active: number;
    prev_weekly_active: number;
    prev_monthly_active: number;
    avg_daily_active: number;
    prev_avg_daily_active: number;
  }>(
    `
    WITH member_counts AS (
      SELECT COUNT(DISTINCT "userId") AS member_count
      FROM memberships
      WHERE "workspaceId" = :workspace_id
        AND "startAt" <= NOW() 
        AND ("endAt" IS NULL OR "endAt" >= NOW())
    ),
    user_activity AS (
      SELECT
        "userId",
        DATE(TIMEZONE('UTC', "createdAt")) as day -- WARNING we use full capital functions and constants as the index we want to use is declared in capital letters, and indices are case-sensitive  
      FROM user_messages
      WHERE "workspaceId" = :workspace_id
        -- WARNING we use full capital functions and constants as the index we want to use is declared in capital letters, and indices are case-sensitive
        AND DATE(TIMEZONE('UTC', "createdAt")) >= CURRENT_DATE - INTERVAL '60 days'
    ),
    daily_activity AS (
      SELECT
        day,
        COUNT(DISTINCT "userId") AS daily_users
      FROM user_activity
      GROUP BY day
    ),
    activity_metrics AS (
      SELECT
        COUNT(DISTINCT CASE WHEN day >= CURRENT_DATE - INTERVAL '7 days' THEN "userId" END) AS weekly_active,
        COUNT(DISTINCT CASE WHEN day >= CURRENT_DATE - INTERVAL '30 days' THEN "userId" END) AS monthly_active,
        COUNT(DISTINCT CASE WHEN day < CURRENT_DATE - INTERVAL '7 days' 
                            AND day >= CURRENT_DATE - INTERVAL '14 days' THEN "userId" END) AS prev_weekly_active,
        COUNT(DISTINCT CASE WHEN day < CURRENT_DATE - INTERVAL '30 days' 
                            AND day >= CURRENT_DATE - INTERVAL '60 days' THEN "userId" END) AS prev_monthly_active
      FROM user_activity
    ),
    daily_averages AS (
      SELECT
        COALESCE(AVG(CASE WHEN day >= CURRENT_DATE - INTERVAL '7 days' THEN daily_users END), 0) AS avg_daily_active,
        COALESCE(AVG(CASE WHEN day < CURRENT_DATE - INTERVAL '7 days' 
                          AND day >= CURRENT_DATE - INTERVAL '14 days' THEN daily_users END), 0) AS prev_avg_daily_active
      FROM daily_activity
    )
    SELECT 
      m.member_count,
      a.weekly_active,
      a.monthly_active,
      a.prev_weekly_active,
      a.prev_monthly_active,
      d.avg_daily_active,
      d.prev_avg_daily_active
    FROM member_counts m, activity_metrics a, daily_averages d
    `,
    {
      replacements: { workspace_id: auth.getNonNullableWorkspace().id },
      type: QueryTypes.SELECT,
    }
  );

  if (results.length !== 1) {
    throw new Error("Unexpected number of results for analytics query.");
  }

  const result = results[0];

  // Calculate growth percentages
  const weeklyGrowth =
    result.prev_weekly_active > 0
      ? ((result.weekly_active - result.prev_weekly_active) /
          result.prev_weekly_active) *
        100
      : 0;

  const monthlyGrowth =
    result.prev_monthly_active > 0
      ? ((result.monthly_active - result.prev_monthly_active) /
          result.prev_monthly_active) *
        100
      : 0;

  const dauGrowth =
    result.prev_avg_daily_active > 0
      ? ((result.avg_daily_active - result.prev_avg_daily_active) /
          result.prev_avg_daily_active) *
        100
      : 0;

  return {
    memberCount: result.member_count,
    weeklyActiveUsers: {
      count: result.weekly_active,
      growth: weeklyGrowth,
    },
    monthlyActiveUsers: {
      count: result.monthly_active,
      growth: monthlyGrowth,
    },
    averageWeeklyDailyActiveUsers: {
      count: Math.round(result.avg_daily_active * 100) / 100,
      growth: Math.round(dauGrowth * 100) / 100,
    },
  };
}
