import type { estypes } from "@elastic/elasticsearch";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { SearchParams } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  getAnalyticsIndex,
  safeEsSearch,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = t.type({
  days: t.union([t.string, t.undefined]),
  size: t.union([t.string, t.undefined]),
});

type TermBucket = {
  key: string;
  doc_count: number;
};

type ToolBucket = TermBucket & {
  statuses?: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
};
type ToolAggs = {
  tools?: {
    tool_names?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
  };
};

export type ToolExecutionRow = {
  tool: string;
  success: number;
  failure: number;
  total: number;
};

export type GetToolExecutionResponse = {
  rows: ToolExecutionRow[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetToolExecutionResponse>>,
  auth: Authenticator
) {
  const assistant = await getAgentConfiguration(auth, {
    agentId: req.query.aId as string,
    variant: "light",
  });

  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  if (!assistant.canEdit && !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can get agent observability.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const q = QuerySchema.decode(req.query);
      if (isLeft(q)) {
        const msg = reporter.formatValidationErrors(q.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${msg}`,
          },
        });
      }

      const days = q.right.days ? parseInt(q.right.days as string, 10) : 30;
      const size = q.right.size ? parseInt(q.right.size as string, 10) : 10;

      const owner = auth.getNonNullableWorkspace();

      const body: SearchParams = {
        index: getAnalyticsIndex(),
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { workspace_id: owner.sId } },
              { term: { agent_id: assistant.sId } },
              { range: { timestamp: { gte: `now-${days}d/d` } } },
            ],
          },
        },
        aggs: {
          tools: {
            nested: { path: "tools_used" },
            aggs: {
              tool_names: {
                terms: {
                  field: "tools_used.tool_name",
                  size,
                  order: { _count: "desc" },
                },
                aggs: {
                  statuses: { terms: { field: "tools_used.status", size: 10 } },
                },
              },
            },
          },
        },
      };

      const json = await safeEsSearch<unknown, ToolAggs>(req, res, body);
      if (!json) {
        return;
      }
      const buckets = bucketsToArray<ToolBucket>(
        json.aggregations?.tools?.tool_names?.buckets
      );

      const rows = buckets.map((b) => {
        const total = b.doc_count || 0;
        const statuses = bucketsToArray<TermBucket>(b.statuses?.buckets);
        const succeeded =
          statuses.find((s) => s.key === "succeeded")?.doc_count || 0;
        const failure = Math.max(0, total - succeeded); // everything not succeeded is considered failure
        return { tool: b.key, success: succeeded, failure, total };
      });

      return res.status(200).json({ rows });
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
