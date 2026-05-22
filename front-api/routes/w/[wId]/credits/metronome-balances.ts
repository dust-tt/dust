import { metronomeBalanceToDisplayData } from "@app/lib/api/credits/metronome_balances";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import { isMetronomeExcessCredit } from "@app/lib/metronome/types";
import type {
  CreditDisplayData,
  GetCreditsResponseBody,
} from "@app/types/credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/metronome-balances.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
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
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Workspace is not configured for Metronome billing.",
      },
    });
  }

  const result = await listMetronomeBalances(metronomeCustomerId);
  if (result.isErr()) {
    return apiError(ctx, {
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
  return ctx.json(body);
});

export default app;
