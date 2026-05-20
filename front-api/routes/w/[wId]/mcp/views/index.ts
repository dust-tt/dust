import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  oauthProviderRequiresWorkspaceConnectionForPersonalAuth,
  withWorkspaceConnectionRequirement,
} from "@app/lib/api/mcp_oauth_prerequisites";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const MCPViewsRequestAvailabilitySchema = z.enum(["manual", "auto"]);
type MCPViewsRequestAvailabilityType = z.infer<
  typeof MCPViewsRequestAvailabilitySchema
>;

const GetMCPViewsRequestSchema = z.object({
  spaceIds: z.array(z.string()),
  availabilities: z.array(MCPViewsRequestAvailabilitySchema),
});

export type GetMCPServerViewsListResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

// We don't allow fetching "auto_hidden_builder".
function isAllowedAvailability(
  availability: string
): availability is MCPViewsRequestAvailabilityType {
  return availability === "manual" || availability === "auto";
}

// Mounted at /api/w/:wId/mcp/views.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const spaceIds = c.req.query("spaceIds");
  const availabilities = c.req.query("availabilities");

  if (!spaceIds || !availabilities) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters",
      },
    });
  }

  const queryValidation = GetMCPViewsRequestSchema.safeParse({
    spaceIds: spaceIds.split(","),
    availabilities: availabilities.split(","),
  });
  if (!queryValidation.success) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(queryValidation.error).toString(),
      },
    });
  }

  const query = queryValidation.data;

  const views = await MCPServerViewResource.listBySpaceIds(
    auth,
    query.spaceIds
  );

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
    return c.json({ success: true, serverViews: flattenedServerViews });
  }

  const workspaceConnections =
    await MCPServerConnectionResource.listWorkspaceConnectionsByMCPServerIds(
      auth,
      { mcpServerIds: mcpServerIdsRequiringWorkspaceConnection }
    );
  const workspaceConnectedMCPServerIds = new Set(
    workspaceConnections.map((connection) => connection.mcpServerId)
  );

  return c.json({
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
});

export default app;
