import { readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import { apiError } from "@front-api/middlewares/utils";

const app = createHono();

const SWAGGER_SPEC_PATH = join(process.cwd(), "public", "swagger.json");

let swaggerSpec: string | null = null;

/** @ignoreswagger */
app.get("/", (ctx) => {
  try {
    swaggerSpec ??= readFileSync(SWAGGER_SPEC_PATH, "utf8");
    return ctx.body(swaggerSpec, 200, { "content-type": "application/json" });
  } catch (error) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to load API documentation.",
        },
      },
      normalizeError(error)
    );
  }
});

export default app;
