import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PluginListItem } from "@app/lib/api/poke/types";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import { isSupportedResourceType } from "@app/types/poke/plugins";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

import pluginId from "./[pluginId]";
import runs from "./runs";

export interface PokeListPluginsForScopeResponseBody {
  plugins: PluginListItem[];
}

const ListPluginsQuerySchema = z.object({
  resourceType: z.string().refine(isSupportedResourceType, {
    message: "Invalid resource type.",
  }),
  resourceId: z.string().optional(),
  workspaceId: z.string().optional(),
});

// Mounted at /api/poke/plugins.
const app = pokeApp();

app.get(
  "/",
  validate("query", ListPluginsQuerySchema),
  async (ctx): HandlerResult<PokeListPluginsForScopeResponseBody> => {
    const { resourceType, resourceId, workspaceId } = ctx.req.valid("query");

    let auth = ctx.get("auth");
    if (workspaceId) {
      const session = ctx.get("session");
      auth = await Authenticator.fromSuperUserSession(session, workspaceId);
    }

    const workspace = auth.workspace();
    const maintenance = workspace?.metadata?.maintenance;

    const plugins = pluginManager.getPluginsForResourceType(resourceType);

    const resource = resourceId
      ? await fetchPluginResource(auth, resourceType, resourceId)
      : null;

    const pluginList = plugins
      .filter((p) => !resourceId || p.isApplicableTo(auth, resource))
      .filter((p) => !p.manifest.isHidden)
      // During maintenance, only show readonly plugins.
      .filter((p) => !maintenance || p.manifest.readonly)
      .map((p) => ({
        id: p.manifest.id,
        name: p.manifest.name,
        description: p.manifest.description,
        readonly: p.manifest.readonly,
      }));

    return ctx.json({ plugins: pluginList });
  }
);

app.route("/runs", runs);
app.route("/:pluginId", pluginId);

export default app;
