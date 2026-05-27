import { TagResource } from "@app/lib/resources/tags_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PutBodySchema = z.object({
  name: z.string(),
  kind: z.enum(["standard", "protected"]),
});

// Mounted at /api/w/:wId/tags/:tId.
const app = workspaceApp();

app.delete("/", ensureIsAdmin(), async (ctx) => {
  const auth = ctx.get("auth");
  const tId = ctx.req.param("tId");

  if (!tId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tag ID is required",
      },
    });
  }

  const tag = await TagResource.fetchById(auth, tId);

  if (!tag) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Tag not found",
      },
    });
  }

  const result = await tag.delete(auth);

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete tag",
      },
    });
  }

  return ctx.body(null, 204);
});

app.put("/", ensureIsAdmin(), validate("json", PutBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const tId = ctx.req.param("tId");

  if (!tId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tag ID is required",
      },
    });
  }

  const tag = await TagResource.fetchById(auth, tId);

  if (!tag) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Tag not found",
      },
    });
  }

  const { name, kind } = ctx.req.valid("json");
  await tag.updateTag({ name, kind });

  return ctx.body(null, 200);
});

export default app;
