import { Hono } from "hono";

import {
  getMetronomeBalances,
  getMetronomeBalancesApiError,
} from "@app/lib/api/credits/metronome_balances";
import type { GetCreditsResponseBody } from "@app/types/credits";

import { jsonApiError } from "@front-api/middleware/utils";

export type GetMetronomeBalancesResponseBody = GetCreditsResponseBody;

// Mounted at /api/w/:wId/credits/metronome-balances.
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

  const result = await getMetronomeBalances(auth);
  if (result.isErr()) {
    return jsonApiError(c, getMetronomeBalancesApiError(result.error));
  }

  const body: GetMetronomeBalancesResponseBody = result.value;
  return c.json(body);
});

export default app;
