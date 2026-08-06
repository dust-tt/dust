import type {
  GetActivationNudgeSettingsResponseBody,
  PatchActivationNudgeSettingsResponseBody,
} from "@app/lib/api/activation/nudge_settings";
import {
  getActivationNudgeSettings,
  PatchActivationNudgeSettingsBodySchema,
  setActivationNudgesEnabled,
} from "@app/lib/api/activation/nudge_settings";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/activation_nudges.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetActivationNudgeSettingsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    return ctx.json({
      activationNudgeSettings: await getActivationNudgeSettings(auth, space),
    });
  }
);

/** @ignoreswagger */
app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchActivationNudgeSettingsBodySchema),
  async (ctx): HandlerResult<PatchActivationNudgeSettingsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { nudgesEnabled } = ctx.req.valid("json");

    return ctx.json({
      activationNudgeSettings: await setActivationNudgesEnabled(auth, space, {
        nudgesEnabled,
      }),
    });
  }
);

export default app;
