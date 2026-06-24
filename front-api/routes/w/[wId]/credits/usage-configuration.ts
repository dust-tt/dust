import {
  getUsageConfiguration,
  updateUsageConfiguration,
} from "@app/lib/api/credits/usage_configuration";
import type {
  GetCreditUsageConfigurationResponseBody,
  PatchCreditUsageConfigurationResponseBody,
} from "@app/types/api/credits/usage_configuration";
import { PatchCreditUsageConfigurationRequestBody } from "@app/types/api/credits/usage_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/credits/usage-configuration.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetCreditUsageConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const configuration = await getUsageConfiguration(auth);

    return ctx.json({ configuration });
  }
);

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchCreditUsageConfigurationRequestBody),
  async (ctx): HandlerResult<PatchCreditUsageConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const result = await updateUsageConfiguration(auth, ctx.req.valid("json"));
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ configuration: result.value });
  }
);

export default app;
