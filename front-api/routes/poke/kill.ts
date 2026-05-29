import type { KillSwitchType } from "@app/lib/poke/types";
import { isKillSwitchType } from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

export type GetKillSwitchesResponseBody = {
  killSwitches: KillSwitchType[];
};

const KillSwitchTypeSchema = z.object({
  enabled: z.boolean(),
  type: z.string(),
});

// Mounted at /api/poke/kill. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetKillSwitchesResponseBody> => {
  const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
  return ctx.json({ killSwitches });
});

app.post(
  "/",
  validate("json", KillSwitchTypeSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const { enabled, type } = ctx.req.valid("json");
    if (!isKillSwitchType(type)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The request body is invalid: ${type} is not a valid kill switch type`,
        },
      });
    }
    if (enabled) {
      await KillSwitchResource.enableKillSwitch(type);
    } else {
      await KillSwitchResource.disableKillSwitch(type);
    }
    return ctx.json({ success: true });
  }
);

export default app;
