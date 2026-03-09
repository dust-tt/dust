import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { estypes } from "@elastic/elasticsearch";
import { stringify } from "csv-stringify/sync";
import type { NextApiRequest, NextApiResponse } from "next";
import { QueryTypes } from "sequelize";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

type TopAgentExportBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
};

type TopAgentsExportAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<TopAgentExportBucket>;
};

interface AgentMetadataRow {
  sId: string;
  name: string;
  description: string;
  settings: string;
  modelId: string;
  providerId: string;
  authorEmail: string | null;
  lastEdit: string;
}

interface AgentExportRow {
  name: string;
  description: string;
  settings: string;
  modelId: string;
  providerId: string;
  authorEmails: string;
  messages: number;
  distinctUsersReached: number;
  distinctConversations: number;
  lastEdit: string;
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

      const esResult = await searchAnalytics<never, TopAgentsExportAggs>(
        {
          bool: {
            filter: [baseQuery],
          },
        },
        {
          aggregations: {
            by_agent: {
              terms: { field: "agent_id", size: 10000 },
              aggs: {
                unique_users: { cardinality: { field: "user_id" } },
                unique_conversations: {
                  cardinality: { field: "conversation_id" },
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
            message: `Failed to retrieve agent analytics: ${esResult.error.message}`,
          },
        });
      }

      const buckets = bucketsToArray<TopAgentExportBucket>(
        esResult.value.aggregations?.by_agent?.buckets
      );

      const esMetrics = new Map(
        buckets.map((b) => [
          String(b.key),
          {
            messages: b.doc_count,
            distinctUsersReached: Math.round(b.unique_users?.value ?? 0),
            distinctConversations: Math.round(
              b.unique_conversations?.value ?? 0
            ),
          },
        ])
      );

      const scopeFilter =
        owner.role === "admin" ? "" : `AND ac."scope" != 'hidden'`;

      const readReplica = getFrontReplicaDbConnection();
      // biome-ignore lint/plugin/noRawSql: Matches existing Activity Report query pattern.
      const agents = await readReplica.query<AgentMetadataRow>(
        `
        SELECT ac."sId",
               ac."name",
               ac."description",
               CASE
                 WHEN ac."scope" = 'visible' THEN 'published'
                 WHEN ac."scope" = 'hidden' THEN 'unpublished'
                 ELSE 'unknown'
               END AS "settings",
               ac."modelId",
               ac."providerId",
               aut."email" AS "authorEmail",
               COALESCE(
                 CAST(ac."updatedAt" AS DATE),
                 CAST(ac."createdAt" AS DATE)
               ) AS "lastEdit"
        FROM "agent_configurations" ac
          LEFT JOIN "users" aut ON ac."authorId" = aut."id"
        WHERE ac."workspaceId" = :wId
          AND ac."status" = 'active'
          ${scopeFilter}
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { wId: owner.id },
        }
      );

      const rows: AgentExportRow[] = agents.map((agent) => {
        const metrics = esMetrics.get(agent.sId);
        return {
          name: agent.name,
          description: agent.description,
          settings: agent.settings,
          modelId: agent.modelId,
          providerId: agent.providerId,
          authorEmails: agent.authorEmail ?? "",
          messages: metrics?.messages ?? 0,
          distinctUsersReached: metrics?.distinctUsersReached ?? 0,
          distinctConversations: metrics?.distinctConversations ?? 0,
          lastEdit: agent.lastEdit,
        };
      });

      rows.sort((a, b) => b.messages - a.messages);

      const headers: (keyof AgentExportRow)[] = [
        "name",
        "description",
        "settings",
        "modelId",
        "providerId",
        "authorEmails",
        "messages",
        "distinctUsersReached",
        "distinctConversations",
        "lastEdit",
      ];
      const csvData = rows.map((row) => headers.map((h) => row[h]));
      const csv = stringify([headers, ...csvData], { header: false });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_agents_last_${q.data.days}_days.csv"`
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
