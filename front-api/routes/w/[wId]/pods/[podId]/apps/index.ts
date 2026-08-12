import {
  clonePodApp,
  deletePodApp,
  listPodApps,
} from "@app/lib/api/projects/apps";
import type {
  ClonePodAppResponseBody,
  DeletePodAppResponseBody,
  GetPodAppsResponseBody,
} from "@app/types/api/pod_apps";
import {
  ClonePodAppRequestBodySchema,
  DeletePodAppParamsSchema,
} from "@app/types/api/pod_apps";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/pods/:podId/apps.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanRead: true, routeParam: "podId" }),
  async (ctx): HandlerResult<GetPodAppsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const appsResult = await listPodApps(auth, space);
    if (appsResult.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: appsResult.error.message,
        },
      });
    }

    return ctx.json({ apps: appsResult.value });
  }
);

/** @ignoreswagger */
app.delete(
  "/:prefix",
  validate("param", DeletePodAppParamsSchema),
  withSpace({ requireCanWrite: true, routeParam: "podId" }),
  async (ctx): HandlerResult<DeletePodAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { prefix } = ctx.req.valid("param");

    const deleteResult = await deletePodApp(auth, space, prefix);
    if (deleteResult.isErr()) {
      switch (deleteResult.error.code) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: deleteResult.error.message,
            },
          });
        case "not_a_pod":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: deleteResult.error.message,
            },
          });
        case "sandbox_unavailable":
          // Databases can only be removed on a live sandbox, and the delete is safe to retry.
          return apiError(ctx, {
            status_code: 503,
            api_error: {
              type: "service_unavailable",
              message: deleteResult.error.message,
            },
          });
        case "internal":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: deleteResult.error.message,
            },
          });
        default:
          assertNever(deleteResult.error.code);
      }
    }

    return ctx.json({ app: deleteResult.value });
  }
);

/** @ignoreswagger */
app.post(
  "/:prefix/clone",
  validate("param", DeletePodAppParamsSchema),
  validate("json", ClonePodAppRequestBodySchema),
  withSpace({ requireCanWrite: true, routeParam: "podId" }),
  async (ctx): HandlerResult<ClonePodAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { prefix } = ctx.req.valid("param");
    const { name } = ctx.req.valid("json");

    const cloneResult = await clonePodApp(auth, space, {
      prefix,
      newName: name,
    });
    if (cloneResult.isErr()) {
      switch (cloneResult.error.code) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: cloneResult.error.message,
            },
          });
        case "name_taken":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: cloneResult.error.message,
            },
          });
        case "not_a_pod":
        case "invalid_name":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: cloneResult.error.message,
            },
          });
        case "sandbox_unavailable":
          // Publishing and reconciling need a live sandbox; the clone is safe to retry.
          return apiError(ctx, {
            status_code: 503,
            api_error: {
              type: "service_unavailable",
              message: cloneResult.error.message,
            },
          });
        case "internal":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: cloneResult.error.message,
            },
          });
        default:
          assertNever(cloneResult.error.code);
      }
    }

    return ctx.json({ app: cloneResult.value }, 201);
  }
);

export default app;
