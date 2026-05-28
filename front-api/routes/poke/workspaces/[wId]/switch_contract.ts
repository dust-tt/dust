import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { SwitchContractErrorKind } from "@app/lib/api/poke/switch_contract";
import {
  SwitchContractBodySchema,
  type SwitchContractError,
  switchContract,
} from "@app/lib/api/poke/switch_contract";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { fromError } from "zod-validation-error";

export interface PokeSwitchContractSuccessResponseBody {
  success: boolean;
}

function statusForKind(kind: SwitchContractErrorKind): {
  status_code: 400 | 500 | 502;
  type: "invalid_request_error" | "internal_server_error";
} {
  switch (kind) {
    case "invalid_request":
      return { status_code: 400, type: "invalid_request_error" };
    case "metronome_api_error":
    case "provision_inconsistent":
      return { status_code: 502, type: "internal_server_error" };
    case "payg_config_failed":
      return { status_code: 500, type: "internal_server_error" };
    default:
      assertNever(kind);
  }
}

// Mounted at /api/poke/workspaces/:wId/switch_contract.
const app = pokeApp();

app.post(
  "/",
  async (ctx): HandlerResult<PokeSwitchContractSuccessResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const rawBody = await ctx.req.json().catch(() => ({}));

    const plugin = pluginManager.getNonNullablePlugin("switch-contract");
    const pluginRun = await PluginRunResource.makeNew(
      plugin,
      rawBody,
      auth.getNonNullableUser(),
      owner,
      { resourceId: owner.sId, resourceType: "workspaces" }
    );

    const validation = SwitchContractBodySchema.safeParse(rawBody);
    if (!validation.success) {
      const errorMessage = `The request body is invalid: ${fromError(validation.error).toString()}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }
    const body = validation.data;

    const result = await switchContract({ auth, body });
    if (result.isErr()) {
      const err: SwitchContractError = result.error;
      await pluginRun.recordError(err.message);
      const { status_code, type } = statusForKind(err.kind);
      return apiError(ctx, {
        status_code,
        api_error: { type, message: err.message },
      });
    }

    const { metronomeContractId } = result.value;
    const paygSummary = body.paygEnabled ? " PAYG enabled." : "";
    const capSummary =
      body.usageCapCredits !== undefined
        ? ` Usage cap: ${body.usageCapCredits} credits.`
        : "";
    const paygStatus = `${paygSummary}${capSummary}`;
    await pluginRun.recordResult({
      display: "text",
      value:
        `Workspace ${owner.name} scheduled to switch to plan ${body.planCode} ` +
        `(Metronome contract ${metronomeContractId}). Subscription will flip ` +
        `when the contract.start webhook fires.${paygStatus}`,
    });
    return ctx.json({ success: true });
  }
);

export default app;
