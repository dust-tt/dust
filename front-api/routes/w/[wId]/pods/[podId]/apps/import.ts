import { importPodApp } from "@app/lib/api/projects/app_archive";
import type { ImportPodAppResponseBody } from "@app/types/api/pod_app_archive";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted at /api/w/:wId/pods/:podId/apps/import.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanWrite: true, routeParam: "podId" }),
  async (ctx): HandlerResult<ImportPodAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    let body: Awaited<ReturnType<typeof ctx.req.parseBody>>;
    try {
      body = await ctx.req.parseBody();
    } catch (err) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `File upload failed: ${normalizeError(err).message}`,
        },
      });
    }

    const uploaded = body.file;
    if (!(uploaded instanceof File)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "A 'file' field holding the archive is required.",
        },
      });
    }
    const name = typeof body.name === "string" ? body.name : undefined;

    const zipBuffer = Buffer.from(await uploaded.arrayBuffer());

    const importResult = await importPodApp(auth, space, { zipBuffer, name });
    if (importResult.isErr()) {
      switch (importResult.error.code) {
        case "name_taken":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: importResult.error.message,
            },
          });
        case "not_a_pod":
        case "invalid_archive":
        case "invalid_name":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: importResult.error.message,
            },
          });
        case "sandbox_unavailable":
          // Publishing and reconciling need a live sandbox; the import is safe to retry.
          return apiError(ctx, {
            status_code: 503,
            api_error: {
              type: "service_unavailable",
              message: importResult.error.message,
            },
          });
        case "internal":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: importResult.error.message,
            },
          });
        default:
          assertNever(importResult.error.code);
      }
    }

    return ctx.json({ app: importResult.value }, 201);
  }
);

export default app;
