import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PokeListPluginsForScopeResponseBody } from "@app/lib/api/poke/plugins/list";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import { hasPokeRole } from "@app/lib/poke/roles";
import { isSupportedResourceType } from "@app/types/poke/plugins";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import pluginId from "./[pluginId]";
import runs from "./runs";

const ListPluginsQuerySchema = z.object({
  resourceType: z.string().refine(isSupportedResourceType, {
    message: "Invalid resource type.",
  }),
  resourceId: z.string().optional(),
  workspaceId: z.string().optional(),
});

// Mounted at /api/poke/plugins.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListPluginsQuerySchema),
  async (ctx): HandlerResult<PokeListPluginsForScopeResponseBody> => {
    const { resourceType, resourceId, workspaceId } = ctx.req.valid("query");

    let auth = ctx.get("auth");
    if (workspaceId) {
      auth = await Authenticator.fromDustSuperUser({
        user: auth.user(),
        wId: workspaceId,
        pokePrincipal: auth.getPokePrincipal(),
      });
    }

    const workspace = auth.workspace();
    const maintenance = workspace?.metadata?.maintenance;

    const plugins = pluginManager.getPluginsForResourceType(resourceType);

    const resource = resourceId
      ? await fetchPluginResource(auth, resourceType, resourceId)
      : null;

    const userRoles = ctx.get("pokeRoles");

    // Resolve applicability first since `isApplicableTo` may be async. The plugin list
    // per resource type is small and bounded, so a sequential pass is fine here.
    const applicablePlugins = [];
    for (const p of plugins) {
      if (!resourceId || (await p.isApplicableTo(auth, resource))) {
        applicablePlugins.push(p);
      }
    }

    const pluginList = applicablePlugins
      .filter((p) => !p.manifest.isHidden)
      // During maintenance, only show readonly plugins.
      .filter((p) => !maintenance || p.manifest.readonly)
      .filter(
        (p) =>
          !p.manifest.requiredRoles ||
          hasPokeRole(userRoles, p.manifest.requiredRoles)
      )
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
