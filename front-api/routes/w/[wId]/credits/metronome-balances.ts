import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import { metronomeBalanceToDisplayData } from "@app/lib/api/credits/metronome_balances";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import { isMetronomeExcessCredit } from "@app/lib/metronome/types";
import type {
  CreditDisplayData,
  GetCreditsResponseBody,
} from "@app/types/credits";

// Mounted at /api/w/:wId/credits/metronome-balances.
const app = new Hono();

app.use("*", workspaceAuth());

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Workspace is not configured for Metronome billing.",
      },
    });
  }

  const result = await listMetronomeBalances(metronomeCustomerId);
  if (result.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve Metronome balances: ${result.error.message}`,
      },
    });
  }

  const programmaticUsdCreditTypeId = getCreditTypeProgrammaticUsdId();
  const credits: CreditDisplayData[] = result.value
    .filter(
      (entry) =>
        entry.access_schedule?.credit_type?.id ===
          programmaticUsdCreditTypeId && !isMetronomeExcessCredit(entry)
    )
    .map(metronomeBalanceToDisplayData);

  const body: GetCreditsResponseBody = { credits };
  return c.json(body);
});

export default app;
