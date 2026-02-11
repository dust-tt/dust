import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import { toCsv } from "@app/lib/api/csv";
import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { getShouldTrackTokenUsageCostsESFilter } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

const COMPOSITE_AGG_SIZE = 10000;

export const ExportQuerySchema = z.object({
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
});

type CompositeKey = {
  date: number;
  agent: string | null;
  api_key: string | null;
  origin: string | null;
};

type CompositeBucket = {
  key: CompositeKey;
  doc_count: number;
  total_cost: estypes.AggregationsSumAggregate;
};

type CompositeAggs = {
  export_data: estypes.AggregationsCompositeAggregate & {
    buckets: CompositeBucket[];
  };
};

export interface ExportRow {
  date: string;
  agent_name: string;
  api_key: string;
  source: string;
  total_spend_usd: string;
  [key: string]: string;
}

async function fetchAllCompositeBuckets(
  baseQuery: estypes.QueryDslQueryContainer,
  afterKey?: Record<string, string | number | null>
): Promise<CompositeBucket[]> {
  const allBuckets: CompositeBucket[] = [];
  let currentAfterKey = afterKey;

  while (true) {
    const result = await searchAnalytics<never, CompositeAggs>(baseQuery, {
      aggregations: {
        export_data: {
          composite: {
            size: COMPOSITE_AGG_SIZE,
            sources: [
              {
                date: {
                  date_histogram: {
                    field: "timestamp",
                    calendar_interval: "day",
                  },
                },
              },
              {
                agent: { terms: { field: "agent_id", missing_bucket: true } },
              },
              {
                api_key: {
                  terms: { field: "api_key_name", missing_bucket: true },
                },
              },
              {
                origin: {
                  terms: { field: "context_origin", missing_bucket: true },
                },
              },
            ],
            ...(currentAfterKey ? { after: currentAfterKey } : {}),
          },
          aggs: {
            total_cost: { sum: { field: "tokens.cost_micro_usd" } },
          },
        },
      },
      size: 0,
    });

    if (result.isErr()) {
      throw new Error(`Failed to fetch export data: ${result.error.message}`);
    }

    const buckets = bucketsToArray<CompositeBucket>(
      result.value.aggregations?.export_data?.buckets
    );

    allBuckets.push(...buckets);

    const afterKeyFromResponse =
      result.value.aggregations?.export_data?.after_key;
    if (!afterKeyFromResponse || buckets.length < COMPOSITE_AGG_SIZE) {
      break;
    }

    currentAfterKey = afterKeyFromResponse;
  }

  return allBuckets;
}

export async function handleProgrammaticCostExportRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const q = ExportQuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const { selectedPeriod, billingCycleStartDay } = q.data;

      const referenceDate = selectedPeriod
        ? new Date(selectedPeriod)
        : new Date();
      if (selectedPeriod) {
        referenceDate.setUTCDate(billingCycleStartDay);
      }
      const { cycleStart: periodStart, cycleEnd: periodEnd } =
        getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);

      const baseQuery: estypes.QueryDslQueryContainer = {
        bool: {
          filter: [
            getShouldTrackTokenUsageCostsESFilter(auth),
            {
              range: {
                timestamp: {
                  gte: periodStart.toISOString(),
                  lt: periodEnd.toISOString(),
                },
              },
            },
          ],
        },
      };

      let allBuckets: CompositeBucket[];
      try {
        allBuckets = await fetchAllCompositeBuckets(baseQuery);
      } catch (err) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              err instanceof Error
                ? err.message
                : "Failed to fetch export data",
          },
        });
      }

      const agentIds = new Set<string>();
      for (const bucket of allBuckets) {
        if (bucket.key.agent) {
          agentIds.add(bucket.key.agent);
        }
      }

      const agentNames: Record<string, string> = {};
      if (agentIds.size > 0) {
        const agents = await AgentConfigurationModel.findAll({
          where: { sId: Array.from(agentIds) },
          attributes: ["sId", "name"],
        });
        for (const agent of agents) {
          agentNames[agent.sId] = agent.name;
        }
      }

      const markupMultiplier = 1 + DUST_MARKUP_PERCENT / 100;

      // Sanitize CSV cells to prevent formula injection when opened in spreadsheets.
      const sanitizeCsvCell = (value: string) =>
        /^[=+\-@]/.test(value) ? `'${value}` : value;

      const rows: ExportRow[] = allBuckets.map((bucket) => {
        const costMicroUsd = (bucket.total_cost.value ?? 0) * markupMultiplier;
        const costUsd = costMicroUsd / 1_000_000;

        const agentId = bucket.key.agent;
        let agentName = "N/A";
        if (agentId) {
          agentName = agentNames[agentId] ?? agentId;
        }

        return {
          date: formatUTCDateFromMillis(bucket.key.date),
          agent_name: sanitizeCsvCell(agentName),
          api_key: sanitizeCsvCell(bucket.key.api_key ?? "N/A"),
          source: sanitizeCsvCell(bucket.key.origin ?? "N/A"),
          total_spend_usd: costUsd.toFixed(2),
        };
      });

      rows.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        const agentCompare = a.agent_name.localeCompare(b.agent_name);
        if (agentCompare !== 0) {
          return agentCompare;
        }
        return a.source.localeCompare(b.source);
      });

      const csv = await toCsv(rows);
      const filename = `programmatic-cost-${selectedPeriod ?? formatUTCDateFromMillis(Date.now()).slice(0, 7)}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.status(200).send(csv);
      return;
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
