import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { Hono } from "hono";

export type GetExtensionConfigResponseBody = {
  blacklistedDomains: string[];
};

// Mounted at /api/w/:wId/extension/config.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const config = await ExtensionConfigurationResource.fetchForWorkspace(auth);

  const body: GetExtensionConfigResponseBody = {
    blacklistedDomains: config?.blacklistedDomains ?? [],
  };
  return ctx.json(body);
});

export default app;
