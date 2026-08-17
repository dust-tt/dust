import type {
  GetActivationWorkAreasResponseBody,
  UpdateActivationWorkAreaResponseBody,
} from "@app/lib/api/activation/work_areas";
import {
  listActivationWorkAreasForUser,
  updateActivationWorkAreaForUser,
} from "@app/lib/api/activation/work_areas";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ListWorkAreasQuerySchema = z.object({
  podId: z.string().optional(),
  status: z.enum(["suggested", "dismissed"]).optional(),
});

const UpdateWorkAreaBodySchema = z.object({
  status: z.enum(["suggested", "dismissed"]).optional(),
  title: z.string().max(255).optional(),
  description: z.string().max(512).optional(),
});

// Mounted at /api/w/:wId/activation-work-areas.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListWorkAreasQuerySchema),
  async (ctx): HandlerResult<GetActivationWorkAreasResponseBody> => {
    const auth = ctx.get("auth");
    const { podId, status } = ctx.req.valid("query");

    const workAreas = await listActivationWorkAreasForUser(auth, {
      podId,
      status,
    });

    return ctx.json({ workAreas });
  }
);

/** @ignoreswagger */
app.patch(
  "/:workAreaId",
  validate("json", UpdateWorkAreaBodySchema),
  async (ctx): HandlerResult<UpdateActivationWorkAreaResponseBody> => {
    const auth = ctx.get("auth");
    const workAreaId = ctx.req.param("workAreaId");
    const { status, title, description } = ctx.req.valid("json");

    const result = await updateActivationWorkAreaForUser(auth, {
      workAreaId,
      status,
      title,
      description,
    });

    if (result.isErr()) {
      switch (result.error.code) {
        case "activation_work_area_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "activation_work_area_not_found",
              message: result.error.message,
            },
          });
        default:
          assertNever(result.error.code);
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
