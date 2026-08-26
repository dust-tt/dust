import { exportPodApp } from "@app/lib/api/projects/app_archive";
import type { PodAppShareError } from "@app/lib/api/projects/app_shares";
import {
  sharePodApp,
  unsharePodApp,
  updatePodAppShare,
} from "@app/lib/api/projects/app_shares";
import {
  clonePodApp,
  deletePodApp,
  listPodApps,
} from "@app/lib/api/projects/apps";
import type {
  ClonePodAppResponseBody,
  DeletePodAppResponseBody,
  DeletePodAppShareResponseBody,
  GetPodAppsResponseBody,
  SharePodAppResponseBody,
} from "@app/types/api/pod_apps";
import {
  ClonePodAppRequestBodySchema,
  DeletePodAppParamsSchema,
  SharePodAppRequestBodySchema,
  UpdatePodAppShareRequestBodySchema,
} from "@app/types/api/pod_apps";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { withSpace } from "@front-api/middlewares/with_space";

import importRoute from "./import";

// Mounted under /api/w/:wId/pods/:podId/apps.
const app = workspaceApp();

// Pod Apps sit on top of Pod Functions, so both flags are required — same gate as the Apps tab.
app.use(
  "*",
  withFeatureFlag("sandbox_functions", {
    message: "Sandbox Functions are not enabled for this workspace.",
  }),
  withFeatureFlag("pod_applications", {
    message: "Pod Apps are not enabled for this workspace.",
  })
);

app.route("/import", importRoute);

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
app.get(
  "/:prefix/export",
  validate("param", DeletePodAppParamsSchema),
  withSpace({ requireCanRead: true, routeParam: "podId" }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { prefix } = ctx.req.valid("param");

    const exportResult = await exportPodApp(auth, space, prefix);
    if (exportResult.isErr()) {
      switch (exportResult.error.code) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: exportResult.error.message,
            },
          });
        case "not_a_pod":
        case "colliding_folders":
        case "too_large":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: exportResult.error.message,
            },
          });
        case "internal":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: exportResult.error.message,
            },
          });
        default:
          assertNever(exportResult.error.code);
      }
    }

    const { fileName, content } = exportResult.value;

    // Raw Response, matching the conversation file download route: the body is binary, not JSON.
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
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

function podAppShareApiError(
  ctx: Parameters<typeof apiError>[0],
  error: PodAppShareError
) {
  switch (error.code) {
    case "not_a_pod":
    case "no_functions":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: error.message,
        },
      });
    case "not_shared":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "name_taken":
    case "already_shared":
      return apiError(ctx, {
        status_code: 409,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "internal":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      });
    default:
      return assertNever(error.code);
  }
}

/** @ignoreswagger */
app.post(
  "/:prefix/share",
  validate("param", DeletePodAppParamsSchema),
  validate("json", SharePodAppRequestBodySchema),
  withSpace({ requireCanAdministrate: true, routeParam: "podId" }),
  async (ctx): HandlerResult<SharePodAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { prefix } = ctx.req.valid("param");
    const { name, description } = ctx.req.valid("json");

    const shareResult = await sharePodApp(auth, space, {
      prefix,
      name,
      description,
    });
    if (shareResult.isErr()) {
      return podAppShareApiError(ctx, shareResult.error);
    }

    return ctx.json({ share: shareResult.value }, 201);
  }
);

/** @ignoreswagger */
app.patch(
  "/:prefix/share",
  validate("param", DeletePodAppParamsSchema),
  validate("json", UpdatePodAppShareRequestBodySchema),
  withSpace({ requireCanAdministrate: true, routeParam: "podId" }),
  async (ctx): HandlerResult<SharePodAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { prefix } = ctx.req.valid("param");
    const { name, description } = ctx.req.valid("json");

    const updateResult = await updatePodAppShare(auth, space, prefix, {
      name,
      description,
    });
    if (updateResult.isErr()) {
      return podAppShareApiError(ctx, updateResult.error);
    }

    return ctx.json({ share: updateResult.value });
  }
);

/** @ignoreswagger */
app.delete(
  "/:prefix/share",
  validate("param", DeletePodAppParamsSchema),
  withSpace({ requireCanAdministrate: true, routeParam: "podId" }),
  async (ctx): HandlerResult<DeletePodAppShareResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { prefix } = ctx.req.valid("param");

    const unshareResult = await unsharePodApp(auth, space, prefix);
    if (unshareResult.isErr()) {
      return podAppShareApiError(ctx, unshareResult.error);
    }

    return ctx.json({ success: true } as const);
  }
);

export default app;
