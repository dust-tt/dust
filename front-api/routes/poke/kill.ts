import type { GetKillSwitchesResponseBody } from "@app/lib/api/poke/kill";
import {
  KilledModelsSchema,
  KillSwitchTypeSchema,
} from "@app/lib/api/poke/kill";
import { isKillableModelId } from "@app/lib/poke/killable_models";
import {
  isKillSwitchType,
  killedModelIdsFromKillSwitches,
  modelIdFromKillSwitchType,
  modelKillSwitchType,
} from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";

// Mounted at /api/poke/kill. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
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

    const modelId = modelIdFromKillSwitchType(type);
    if (modelId !== null && !isKillableModelId(modelId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The request body is invalid: ${modelId} cannot be killed`,
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

/**
 * Replaces the set of killed models with the one submitted. Model kill switches
 * are ordinary `kill_switches` rows, this just diffs them in one shot.
 *
 * @ignoreswagger
 */
app.post(
  "/models",
  validate("json", KilledModelsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const { killedModelIds } = ctx.req.valid("json");

    const invalidModelIds = killedModelIds.filter(
      (modelId) => !isKillableModelId(modelId)
    );
    if (invalidModelIds.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The request body is invalid: " +
            `${invalidModelIds.join(", ")} cannot be killed`,
        },
      });
    }

    const enabledKillSwitches =
      await KillSwitchResource.listEnabledKillSwitches();
    const currentlyKilledModelIds =
      killedModelIdsFromKillSwitches(enabledKillSwitches);
    const currentlyKilled = new Set(currentlyKilledModelIds);
    const requested = new Set(killedModelIds);

    const toEnable = killedModelIds
      .filter((modelId) => !currentlyKilled.has(modelId))
      .map(modelKillSwitchType);
    const toDisable = currentlyKilledModelIds
      .filter((modelId) => !requested.has(modelId))
      .map(modelKillSwitchType);

    // Bounded by the model catalog (~50 entries) and rarely more than a handful
    // of rows actually change, so sequential writes are fine here.
    for (const type of toEnable) {
      await KillSwitchResource.enableKillSwitch(type);
    }
    for (const type of toDisable) {
      await KillSwitchResource.disableKillSwitch(type);
    }

    return ctx.json({ success: true });
  }
);

export default app;
