import type { GetDegradedModelsResponseBody } from "@app/lib/api/poke/degraded_models";
import {
  listDegradableEndpointsWithStatus,
  resolveDegradedEndpointUpdates,
  UpdateDegradedModelsSchema,
} from "@app/lib/api/poke/degraded_models";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";

const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetDegradedModelsResponseBody> =>
    ctx.json({
      endpoints: await listDegradableEndpointsWithStatus(),
    })
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", UpdateDegradedModelsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const resolvedRes = resolveDegradedEndpointUpdates(
      ctx.req.valid("json").endpoints
    );
    if (resolvedRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The request body is invalid: ${resolvedRes.error.message}`,
        },
      });
    }

    await ModelDegradationResource.updateDegradedEndpoints(resolvedRes.value);

    return ctx.json({ success: true });
  }
);

export default app;
