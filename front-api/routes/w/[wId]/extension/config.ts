import { Hono } from "hono";

import { ExtensionConfigurationResource } from "@app/lib/resources/extension";

export type GetExtensionConfigResponseBody = {
  blacklistedDomains: string[];
};

// Mounted at /api/w/:wId/extension/config.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const config = await ExtensionConfigurationResource.fetchForWorkspace(auth);

  const body: GetExtensionConfigResponseBody = {
    blacklistedDomains: config?.blacklistedDomains ?? [],
  };
  return c.json(body);
});

export default app;
