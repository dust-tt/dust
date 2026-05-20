import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { fetchContextOriginBreakdown } from "@app/lib/api/assistant/observability/context_origin";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type GetWorkspaceContextOriginResponse = {
  total: number;
  buckets: {
    origin: string;
    count: number;
  }[];
};

// Mounted at /api/w/:wId/analytics/source.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const { days } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const result = await fetchContextOriginBreakdown(baseQuery);

  if (result.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve source breakdown: ${fromError(result.error).toString()}`,
      },
    });
  }

  const buckets = result.value;
  const total = buckets.reduce((acc, b) => acc + b.count, 0);

  const body: GetWorkspaceContextOriginResponse = { total, buckets };
  return c.json(body);
});

export default app;
