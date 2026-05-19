import { Hono } from "hono";

import type { AwuPoolSummaryResponseBody } from "@app/lib/api/credits/awu_pool_summary";
import {
  getAwuPoolSummary,
  getAwuPoolSummaryApiError,
} from "@app/lib/api/credits/awu_pool_summary";

import { jsonApiError } from "@front-api/middleware/utils";

export type GetAwuPoolSummaryResponseBody = AwuPoolSummaryResponseBody;

// Mounted at /api/w/:wId/credits/awu-pool-summary.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can view credits.",
        },
      },
      403
    );
  }

  const result = await getAwuPoolSummary(auth);
  if (result.isErr()) {
    return jsonApiError(c, getAwuPoolSummaryApiError(result.error));
  }

  const body: GetAwuPoolSummaryResponseBody = result.value;
  return c.json(body);
});

export default app;
