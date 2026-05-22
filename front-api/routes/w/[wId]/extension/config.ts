import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetExtensionConfigResponseBody = {
  blacklistedDomains: string[];
};

// Mounted at /api/w/:wId/extension/config.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetExtensionConfigResponseBody> => {
  const auth = ctx.get("auth");

  const config = await ExtensionConfigurationResource.fetchForWorkspace(auth);

  return ctx.json({
    blacklistedDomains: config?.blacklistedDomains ?? [],
  });
});

export default app;
