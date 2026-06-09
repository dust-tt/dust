import {
  getDustStatusMemoized,
  getProviderStatusMemoized,
} from "@app/lib/api/status";
import { createHono } from "@front-api/lib/hono";

export const appStatusApp = createHono();

appStatusApp.get("/", async (ctx) => {
  const [providersStatus, dustStatus] = await Promise.all([
    getProviderStatusMemoized(),
    getDustStatusMemoized(),
  ]);

  ctx.header(
    "Cache-Control",
    "public, max-age=120, stale-while-revalidate=300"
  );
  return ctx.json({ providersStatus, dustStatus }, 200);
});
