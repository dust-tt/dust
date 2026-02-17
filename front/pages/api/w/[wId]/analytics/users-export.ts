import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { getUserGroupMemberships } from "@app/lib/workspace_usage";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { estypes } from "@elastic/elasticsearch";
import { stringify } from "csv-stringify/sync";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

type TopUserExportBucket = {
  key: string;
  doc_count: number;
  last_message?: estypes.AggregationsMaxAggregate;
  active_days?: estypes.AggregationsDateHistogramAggregate;
};

type TopUsersExportAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<TopUserExportBucket>;
};

interface UserExportRow {
  userId: string;
  userName: string;
  userEmail: string;
  messageCount: number;
  lastMessageSent: string;
  activeDaysCount: number;
  groups: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { days } = req.query;
      const q = QuerySchema.safeParse({ days });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days: q.data.days,
      });

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
                  },
                },
              },
            },
          },
          size: 0,
        }
      );

      if (esResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve user analytics: ${esResult.error.message}`,
          },
        });
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
                  ? formatUTCDateFromMillis(lastMessageMs)
                  : "",
              activeDaysCount: Array.isArray(activeDaysBuckets)
                ? activeDaysBuckets.filter((d) => d.doc_count > 0).length
                : 0,
            },
          ] as const;
        })
      );

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - q.data.days);

      const memberships = await MembershipModel.findAll({
        where: {
          workspaceId: owner.id,
          startAt: { [Op.lte]: now },
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

      const groupsMap = await getUserGroupMemberships(owner.id, startDate, now);

      const rows: UserExportRow[] = memberships.map((membership) => {
        const user = (membership as MembershipModel & { user: UserModel }).user;
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

      const headers: (keyof UserExportRow)[] = [
        "userId",
        "userName",
        "userEmail",
        "messageCount",
        "lastMessageSent",
        "activeDaysCount",
        "groups",
      ];
      const csvData = rows.map((row) => headers.map((h) => row[h]));
      const csv = stringify([headers, ...csvData], { header: false });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_users_last_${q.data.days}_days.csv"`
      );
      return res.status(200).send(csv);
    }
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
