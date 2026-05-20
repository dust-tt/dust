import {
  getDustStatusMemoized,
  getProviderStatusMemoized,
} from "@app/lib/api/status";
import { Hono } from "hono";

export const appStatusApp = new Hono();

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
