import { Hono } from "hono";

import {
  getDustStatusMemoized,
  getProviderStatusMemoized,
} from "@app/lib/api/status";

export const appStatusApp = new Hono();

appStatusApp.get("/", async (c) => {
  const [providersStatus, dustStatus] = await Promise.all([
    getProviderStatusMemoized(),
    getDustStatusMemoized(),
  ]);

  c.header("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
  return c.json({ providersStatus, dustStatus }, 200);
});
