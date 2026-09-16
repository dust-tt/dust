import { InferenceHookResource } from "@app/lib/resources/inference_hook_resource";
import type {
  DeleteInferenceHookResponseBody,
  GetInferenceHookResponseBody,
  UpsertInferenceHookResponseBody,
} from "@app/types/inference_hook";
import { UpsertInferenceHookBodySchema } from "@app/types/inference_hook";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/inference_hooks.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetInferenceHookResponseBody> => {
  const auth = ctx.get("auth");

  if (!(await auth.hasFeatureFlag("inference_hooks"))) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "feature_flag_not_found",
        message: "Inference hooks are not enabled for this workspace.",
      },
    });
  }

  const inferenceHook = await InferenceHookResource.fetchForWorkspace(auth);
  return ctx.json({
    inferenceHook: inferenceHook ? inferenceHook.toJSON() : null,
  });
});

/** @ignoreswagger */
app.put(
  "/",
  ensureIsAdmin(),
  validate("json", UpsertInferenceHookBodySchema),
  async (ctx): HandlerResult<UpsertInferenceHookResponseBody> => {
    const auth = ctx.get("auth");

    if (!(await auth.hasFeatureFlag("inference_hooks"))) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "feature_flag_not_found",
          message: "Inference hooks are not enabled for this workspace.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const result = await InferenceHookResource.upsert(auth, body);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ inferenceHook: result.value.toJSON() });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<DeleteInferenceHookResponseBody> => {
    const auth = ctx.get("auth");

    if (!(await auth.hasFeatureFlag("inference_hooks"))) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "feature_flag_not_found",
          message: "Inference hooks are not enabled for this workspace.",
        },
      });
    }

    const inferenceHook = await InferenceHookResource.fetchForWorkspace(auth);
    if (!inferenceHook) {
      return ctx.json({ success: true });
    }

    const deleted = await inferenceHook.delete(auth, {});
    if (deleted.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: deleted.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
