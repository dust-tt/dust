import type { CancelPendingContractErrorKind } from "@app/lib/api/poke/cancel_pending_contract";
import {
  type CancelPendingContractError,
  cancelPendingContract,
} from "@app/lib/api/poke/cancel_pending_contract";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export interface PokeCancelPendingContractSuccessResponseBody {
  success: boolean;
}

function statusForKind(kind: CancelPendingContractErrorKind): {
  status_code: 400 | 500 | 502;
  type: "invalid_request_error" | "internal_server_error";
} {
  switch (kind) {
    case "invalid_request":
      return { status_code: 400, type: "invalid_request_error" };
    case "restore_failed":
      return { status_code: 502, type: "internal_server_error" };
    case "cleanup_inconsistent":
      return { status_code: 500, type: "internal_server_error" };
    default:
      assertNever(kind);
  }
}

// Mounted at /api/poke/workspaces/:wId/cancel_pending_contract.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  async (ctx): HandlerResult<PokeCancelPendingContractSuccessResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const rawBody = await ctx.req.json().catch(() => ({}));

    const plugin = pluginManager.getNonNullablePlugin(
      "cancel-pending-contract"
    );
    const pluginRun = await PluginRunResource.makeNew(
      plugin,
      rawBody,
      auth.getNonNullableUser(),
      owner,
      { resourceId: owner.sId, resourceType: "workspaces" }
    );

    const result = await cancelPendingContract({ auth });
    if (result.isErr()) {
      const err: CancelPendingContractError = result.error;
      await pluginRun.recordError(err.message);
      const { status_code, type } = statusForKind(err.kind);
      return apiError(ctx, {
        status_code,
        api_error: { type, message: err.message },
      });
    }

    const { cancelledMetronomeContractId } = result.value;
    await pluginRun.recordResult({
      display: "text",
      value:
        `Cancelled pending contract switch for ${owner.name}. ` +
        (cancelledMetronomeContractId
          ? `Archived Metronome contract ${cancelledMetronomeContractId}. `
          : "") +
        "The current subscription/contract was restored.",
    });
    return ctx.json({ success: true });
  }
);

export default app;
