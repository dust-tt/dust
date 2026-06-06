import logger from "@app/logger/logger";
import { createHono } from "@front-api/lib/hono";
import { createSwaggerSpec } from "next-swagger-doc";

const app = createHono();

// `next-swagger-doc` resolves `apiFolder` against `process.cwd()`. The Hono
// server runs from `front-api/`, so we scan our own public API routes for the
// `@swagger` JSDoc annotations (and the shared component schemas defined in
// `routes/v1/w/[wId]/swagger_schemas.ts`).
const API_FOLDER = "./routes/v1";

app.get("/", (ctx) => {
  try {
    const spec = createSwaggerSpec({
      definition: {
        openapi: "3.0.0",
        info: {
          title: "NextJS Swagger",
          version: "0.1.0",
        },
      },
      apiFolder: API_FOLDER,
    });
    return ctx.json(spec);
  } catch (error) {
    logger.error({ error }, "Failed to build swagger spec");
    return ctx.body(null, 400);
  }
});

export default app;
