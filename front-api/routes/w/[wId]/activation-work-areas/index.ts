import type {
  CreateActivationWorkAreasResponseBody,
  GetActivationWorkAreasResponseBody,
  UpdateActivationWorkAreaResponseBody,
} from "@app/lib/api/activation/work_areas";
import {
  createActivationWorkAreasForUser,
  listActivationWorkAreasForUser,
  updateActivationWorkAreaForUser,
} from "@app/lib/api/activation/work_areas";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ListWorkAreasQuerySchema = z.object({
  status: z.enum(["candidate", "confirmed", "dismissed"]).optional(),
});

const CreateWorkAreaItemSchema = z.object({
  title: z.string().max(255),
  description: z.string().max(512),
});

const CreateWorkAreasBodySchema = z.object({
  workAreas: z.array(CreateWorkAreaItemSchema).min(1).max(10),
});

const UpdateWorkAreaBodySchema = z.object({
  status: z.enum(["candidate", "confirmed", "dismissed"]).optional(),
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
    const { status } = ctx.req.valid("query");

    const workAreas = await listActivationWorkAreasForUser(auth, { status });

    return ctx.json({ workAreas });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", CreateWorkAreasBodySchema),
  async (ctx): HandlerResult<CreateActivationWorkAreasResponseBody> => {
    const auth = ctx.get("auth");
    const { workAreas: items } = ctx.req.valid("json");

    const workAreas = await createActivationWorkAreasForUser(auth, items);

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

    switch (result) {
      case "not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "work_area_not_found",
            message: "Work area not found.",
          },
        });
      case "unauthorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "forbidden",
            message: "Cannot update a work area owned by another user.",
          },
        });
      case "ok":
        return ctx.json({ success: true });
    }
  }
);

export default app;
