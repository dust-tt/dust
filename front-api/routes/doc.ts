import { readFileSync } from "node:fs";
import { join } from "node:path";

import logger from "@app/logger/logger";
import { createHono } from "@front-api/lib/hono";

const app = createHono();

// The spec is generated from the `@swagger` annotations by `npm run docs` and
// committed; CI fails if it drifts from the routes. Serving the file keeps
// swagger-jsdoc (and its glob scan of every route file) out of the server.
const SPEC_PATH = join(process.cwd(), "public", "swagger.json");

let spec: string | null = null;

app.get("/", (ctx) => {
  try {
    spec ??= readFileSync(SPEC_PATH, "utf8");
    return ctx.body(spec, 200, { "content-type": "application/json" });
  } catch (error) {
    logger.error({ error }, "Failed to read swagger spec");
    return ctx.body(null, 400);
  }
});

export default app;
