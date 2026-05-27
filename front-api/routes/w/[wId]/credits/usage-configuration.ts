import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type CreditUsageConfigurationBody = {
  disableCreditCapWarning: boolean;
};

export type GetCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export type PatchCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export const PatchCreditUsageConfigurationRequestBody = z
  .object({
    disableCreditCapWarning: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// Defaults returned when no row exists for the workspace.
const DEFAULT_CONFIGURATION: CreditUsageConfigurationBody = {
  disableCreditCapWarning: false,
};

// Mounted at /api/w/:wId/credits/usage-configuration.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetCreditUsageConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const existing =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

    return ctx.json({
      configuration: existing
        ? { disableCreditCapWarning: existing.disableCreditCapWarning }
        : DEFAULT_CONFIGURATION,
    });
  }
);

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchCreditUsageConfigurationRequestBody),
  async (ctx): HandlerResult<PatchCreditUsageConfigurationResponseBody> => {
    const auth = ctx.get("auth");

    const patch = ctx.req.valid("json");

    const existing =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

    let configuration: CreditUsageConfigurationResource;
    if (existing) {
      const updateResult = await existing.updateConfiguration(auth, patch);
      if (updateResult.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: updateResult.error.message,
          },
        });
      }
      configuration = existing;
    } else {
      const createResult = await CreditUsageConfigurationResource.makeNew(
        auth,
        {
          defaultDiscountPercent: 0,
          paygCapCredits: null,
          disableCreditCapWarning: false,
          ...patch,
        }
      );
      if (createResult.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: createResult.error.message,
          },
        });
      }
      configuration = createResult.value;
    }

    return ctx.json({
      configuration: {
        disableCreditCapWarning: configuration.disableCreditCapWarning,
      },
    });
  }
);

export default app;
