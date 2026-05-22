import { Authenticator } from "@app/lib/auth";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import type { PluginRunType } from "@app/types/poke/plugins";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export interface PokeListPluginRunsResponseBody {
  pluginRuns: PluginRunType[];
}

const ListPluginRunsQuerySchema = z.object({
  workspaceId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
});

// Mounted at /api/poke/plugins/runs.
const app = pokeApp();

app.get(
  "/",
  validate("query", ListPluginRunsQuerySchema),
  async (ctx): HandlerResult<PokeListPluginRunsResponseBody> => {
    const { workspaceId, resourceType, resourceId } = ctx.req.valid("query");

    let auth = ctx.get("auth");
    if (workspaceId) {
      const session = ctx.get("session");
      auth = await Authenticator.fromSuperUserSession(session, workspaceId);
    }

    let pluginRuns;
    if (resourceType && resourceId) {
      // Resource-level plugins: specific to a resource within a workspace.
      pluginRuns = await PluginRunResource.findByWorkspaceAndResource(auth, {
        resourceId,
        resourceType,
      });
    } else if (workspaceId) {
      // Workspace-level plugins: all plugins for a workspace.
      pluginRuns = await PluginRunResource.findByWorkspaceId(auth);
    } else {
      // Global plugins: system-wide plugins with no workspace context.
      pluginRuns = await PluginRunResource.findGlobalRuns();
    }

    return ctx.json({
      pluginRuns: pluginRuns.map((run) => run.toJSON()),
    });
  }
);

export default app;
