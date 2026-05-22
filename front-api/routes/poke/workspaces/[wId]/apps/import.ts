import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import type { AppType } from "@app/types/app";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

type ImportAppResponseBody = {
  app: AppType;
};

export const AppTypeSchema = z.object({
  sId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  savedSpecification: z.string().nullable(),
  savedConfig: z.string().nullable(),
  savedRun: z.string().nullable(),
  dustAPIProjectId: z.string(),
  datasets: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        schema: z
          .array(
            z.object({
              type: z.enum(["string", "number", "boolean", "json"]),
              description: z.string().nullable(),
              key: z.string(),
            })
          )
          .nullish(),
        data: z.array(z.record(z.string(), z.any())).nullish(),
      })
    )
    .optional(),
  coreSpecifications: z.record(z.string(), z.string()).optional(),
});

export const ImportAppBody = z.object({
  app: AppTypeSchema,
});

const ImportQuerySchema = z.object({
  spaceId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/apps/import.
const app = pokeApp();

app.post(
  "/",
  validate("query", ImportQuerySchema),
  validate("json", ImportAppBody),
  async (ctx): HandlerResult<ImportAppResponseBody> => {
    const auth = ctx.get("auth");
    const { spaceId } = ctx.req.valid("query");
    const body = ctx.req.valid("json");

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Space not found.",
        },
      });
    }

    const result = await importApp(auth, space, body.app);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ app: result.value.app.toJSON() });
  }
);

export default app;
