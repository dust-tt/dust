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
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
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

    const pod = await ActivationPodResource.fetchByUser(auth);
    if (!pod) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "not_found",
          message: "No activation pod found for this user.",
        },
      });
    }

    const workAreas = await createActivationWorkAreasForUser(
      auth,
      items,
      pod.id
    );

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
              type: "work_area_not_found",
              message: result.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "forbidden",
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
