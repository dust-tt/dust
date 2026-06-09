import type { GetMetronomeContractResponseBody } from "@app/lib/api/credits/metronome_contract";
import {
  applyContractLifecycleAction,
  getMetronomeContractSummary,
  PatchMetronomeContractRequestBody,
} from "@app/lib/api/credits/metronome_contract";
import type { ContractLifecycleError } from "@app/lib/metronome/contract_lifecycle";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";

type PatchMetronomeContractResponseBody = {
  success: boolean;
};

function lifecycleErrorToApi(ctx: Context, err: ContractLifecycleError) {
  return apiError(ctx, {
    status_code: err.kind === "invalid_state" ? 400 : 502,
    api_error: {
      type:
        err.kind === "invalid_state"
          ? "subscription_state_invalid"
          : "internal_server_error",
      message: err.message,
    },
  });
}

// Mounted at /api/w/:wId/metronome/contract.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetMetronomeContractResponseBody> => {
    const auth = ctx.get("auth");

    const result = await getMetronomeContractSummary(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: `Failed to fetch Metronome contract: ${result.error.message}`,
        },
      });
    }
    return ctx.json({ contract: result.value });
  }
);

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchMetronomeContractRequestBody),
  async (ctx): HandlerResult<PatchMetronomeContractResponseBody> => {
    const auth = ctx.get("auth");
    const { action } = ctx.req.valid("json");

    const result = await applyContractLifecycleAction(auth, action);
    if (result.isErr()) {
      return lifecycleErrorToApi(ctx, result.error);
    }
    return ctx.json({ success: true });
  }
);

export default app;
