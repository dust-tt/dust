import type { GetMCPServerViewsListResponseBody } from "@app/lib/api/mcp";
import {
  oauthProviderRequiresWorkspaceConnectionForPersonalAuth,
  withWorkspaceConnectionRequirement,
} from "@app/lib/api/mcp_oauth_prerequisites";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { MCPServerViewFetchMode } from "@app/lib/resources/mcp_server_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import view from "./[viewId]";
import jit from "./jit";

const MCPViewsRequestAvailabilitySchema = z.enum(["manual", "auto"]);
type MCPViewsRequestAvailabilityType = z.infer<
  typeof MCPViewsRequestAvailabilitySchema
>;

// Both params are comma-separated lists. A missing `spaceIds` defaults to all
// member spaces; an empty one is invalid.
const GetMCPViewsQuerySchema = z.object({
  spaceIds: z
    .string()
    .min(1)
    .optional()
    .transform((value) => value?.split(","))
    .pipe(z.array(z.string()).optional()),
  availabilities: z
    .string()
    .min(1)
    .transform((value) => value.split(","))
    .pipe(z.array(MCPViewsRequestAvailabilitySchema)),
  includeRestrictedToSkills: z.string().optional(),
});

// We don't allow fetching "auto_hidden_builder".
function isAllowedAvailability(
  availability: string
): availability is MCPViewsRequestAvailabilityType {
  return availability === "manual" || availability === "auto";
}

// Mounted at /api/w/:wId/mcp/views.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetMCPViewsQuerySchema),
  async (ctx): HandlerResult<GetMCPServerViewsListResponseBody> => {
    const auth = ctx.get("auth");
    const query = ctx.req.valid("query");
    const includeRestrictedToSkills =
      query.includeRestrictedToSkills === "true";

    const listOptions: {
      mode: MCPServerViewFetchMode;
      isRestrictedToSkills: false | undefined;
    } = {
      mode: "configuration",
      isRestrictedToSkills: includeRestrictedToSkills ? undefined : false,
    };

    // Without `spaceIds`, default to all the spaces the user is a member of.
    let views: MCPServerViewResource[];
    if (query.spaceIds) {
      views = await MCPServerViewResource.listBySpaceIdsEnsuringAutoViews(
        auth,
        query.spaceIds,
        listOptions
      );
    } else {
      const memberSpaces =
        await SpaceResource.listWorkspaceSpacesAsMember(auth);
      views = await MCPServerViewResource.listBySpacesEnsuringAutoViews(
        auth,
        memberSpaces,
        listOptions
      );
    }

    const flattenedServerViews = views
      .map((v) => v.toJSON())
      .filter(
        (v) =>
          isAllowedAvailability(v.server.availability) &&
          query.availabilities.includes(v.server.availability)
      );

    // Enrich servers whose OAuth provider requires a workspace-level connection
    // before users can set up personal connections, so the client can block the
    // OAuth popup and show an inline error.
    const mcpServerIdsRequiringWorkspaceConnection = [
      ...new Set(
        flattenedServerViews
          .filter(
            (v) =>
              v.server.authorization !== null &&
              oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
                v.server.authorization.provider
              )
          )
          .map((v) => v.server.sId)
      ),
    ];

    if (mcpServerIdsRequiringWorkspaceConnection.length === 0) {
      return ctx.json({ success: true, serverViews: flattenedServerViews });
    }

    const workspaceConnections =
      await MCPServerConnectionResource.listWorkspaceConnectionsByMCPServerIds(
        auth,
        { mcpServerIds: mcpServerIdsRequiringWorkspaceConnection }
      );
    const workspaceConnectedMCPServerIds = new Set(
      workspaceConnections.map((connection) => connection.mcpServerId)
    );

    return ctx.json({
      success: true,
      serverViews: flattenedServerViews.map((serverView) => ({
        ...serverView,
        server: {
          ...serverView.server,
          authorization: withWorkspaceConnectionRequirement(
            serverView.server.authorization,
            {
              isWorkspaceConnected: workspaceConnectedMCPServerIds.has(
                serverView.server.sId
              ),
            }
          ),
        },
      })),
    });
  }
);

app.route("/jit", jit);
app.route("/:viewId", view);

export default app;
