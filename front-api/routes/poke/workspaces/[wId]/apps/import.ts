import { Hono } from "hono";
import { z } from "zod";

import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import type { AppType } from "@app/types/app";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

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
const app = new Hono();

app.post(
  "/",
  validate("query", ImportQuerySchema),
  validate("json", ImportAppBody),
  async (c) => {
    const auth = c.get("auth");
    const { spaceId } = c.req.valid("query");
    const body = c.req.valid("json");

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Space not found.",
        },
      });
    }

    const result = await importApp(auth, space, body.app);
    if (result.isErr()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    const responseBody: { app: AppType } = { app: result.value.app.toJSON() };
    return c.json(responseBody);
  }
);

export default app;
