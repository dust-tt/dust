import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetExtensionConfigResponseBody = {
  blacklistedDomains: string[];
};

// Mounted at /api/w/:wId/extension/config.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetExtensionConfigResponseBody> => {
  const auth = ctx.get("auth");

  const config = await ExtensionConfigurationResource.fetchForWorkspace(auth);

  return ctx.json({
    blacklistedDomains: config?.blacklistedDomains ?? [],
  });
});

export default app;
