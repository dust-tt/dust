import { Hono } from "hono";

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

  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      },
      400
    );
  }

  const result = await listMetronomeBalances(metronomeCustomerId);
  if (result.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome balances: ${result.error.message}`,
        },
      },
      500
    );
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
