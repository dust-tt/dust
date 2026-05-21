import logger from "@app/logger/logger";
import { Hono } from "hono";
import { createSwaggerSpec } from "next-swagger-doc";

const app = new Hono();

// `next-swagger-doc` resolves `apiFolder` against `process.cwd()`. The
// Hono server runs from `front-api/`, so we point at the sibling `front`
// project's API folder to scan the same files as the Next route.
const API_FOLDER = "../front/pages/api/v1";

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
