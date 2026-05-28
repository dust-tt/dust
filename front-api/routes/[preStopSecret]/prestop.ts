import { runPreStop } from "@app/lib/api/prestop";
import logger from "@app/logger/logger";
import { createHono } from "@front-api/lib/hono";

const app = createHono();

app.post("/", async (ctx) => {
  const preStopSecret = ctx.req.param("preStopSecret");
  const { PRESTOP_SECRET } = process.env;
  if (!PRESTOP_SECRET) {
    logger.error("PRESTOP_SECRET is not defined");
  }

  if (!PRESTOP_SECRET || preStopSecret !== PRESTOP_SECRET) {
    return ctx.body(null, 404);
  }

  await runPreStop();

  return ctx.body(null, 200);
});

export default app;
