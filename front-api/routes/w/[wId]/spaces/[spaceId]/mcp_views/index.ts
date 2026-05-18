import { Hono } from "hono";
import { z } from "zod";

import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { sendMCPGlobalSharingReconfigurationEmail } from "@app/lib/api/email";
import {
  oauthProviderRequiresWorkspaceConnectionForPersonalAuth,
  withWorkspaceConnectionRequirement,
} from "@app/lib/api/mcp_oauth_prerequisites";
import { getActiveAdminEmails } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceKind } from "@app/types/space";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

import notActivated from "./not_activated";
import svId from "./[svId]";

const GetQueryParamsSchema = z.object({
  availability: z
    .enum(["manual", "auto", "auto_hidden_builder", "all"])
    .optional(),
});

const PostBodySchema = z.object({
  mcpServerId: z.string(),
});

async function notifyWorkspaceAdminsAboutAffectedAgents(
  auth: Authenticator,
  {
    toolName,
    agentNames,
  }: {
    toolName: string;
    agentNames: string[];
  }
): Promise<Result<void, Error>> {
  if (agentNames.length === 0) {
    return new Ok(undefined);
  }

  const workspace = auth.getNonNullableWorkspace();
  try {
    const adminEmails = await getActiveAdminEmails(auth);

    const results = await concurrentExecutor(
      adminEmails,
      async (email) =>
        sendMCPGlobalSharingReconfigurationEmail({
          email,
          workspaceName: workspace.name,
          toolName,
          agentNames,
        }),
      { concurrency: 8 }
    );

    const failedEmails = results.flatMap((result, index) =>
      result.isErr() ? [adminEmails[index]] : []
    );

    if (failedEmails.length === 0) {
      return new Ok(undefined);
    }

    logger.error(
      {
        workspaceId: workspace.sId,
        toolName,
        agentNames,
        failedEmails,
      },
      "Failed to send MCP global sharing reconfiguration emails"
    );

    return new Err(
      new Error("Failed to send MCP global sharing reconfiguration emails")
    );
  } catch (error) {
    const normalizedError = normalizeError(error);

    logger.error(
      {
        error: normalizedError,
        workspaceId: workspace.sId,
        toolName,
        agentNames,
      },
      "Failed to notify workspace admins about MCP global sharing impact"
    );

    return new Err(normalizedError);
  }
}

// Mounted under /api/w/:wId/spaces/:spaceId/mcp_views.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    const r = GetQueryParamsSchema.safeParse({
      availability: c.req.query("availability"),
    });

    if (!r.success) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        },
        400
      );
    }

    const { availability = "manual" } = r.data;

    const serverViews = (
      await MCPServerViewResource.listBySpace(auth, space)
    ).map((view) => view.toJSON());

    const filteredServerViews = serverViews.filter(
      (s) => availability === "all" || s.server.availability === availability
    );

    // Some OAuth providers require a workspace-level connection before users
    // can set up personal connections. We enrich the authorization info so the
    // client can block the OAuth popup and show an inline error instead.
    // The DB query is only made for servers in the list that need it.
    const mcpServerIdsRequiringWorkspaceConnection = [
      ...new Set(
        filteredServerViews
          .filter(
            (s) =>
              s.server.authorization !== null &&
              oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
                s.server.authorization.provider
              )
          )
          .map((s) => s.server.sId)
      ),
    ];

    if (mcpServerIdsRequiringWorkspaceConnection.length === 0) {
      return c.json({
        success: true,
        serverViews: filteredServerViews,
      });
    }

    const workspaceConnections =
      await MCPServerConnectionResource.listWorkspaceConnectionsByMCPServerIds(
        auth,
        {
          mcpServerIds: mcpServerIdsRequiringWorkspaceConnection,
        }
      );
    const workspaceConnectedMCPServerIds = new Set(
      workspaceConnections.map((connection) => connection.mcpServerId)
    );

    return c.json({
      success: true,
      serverViews: filteredServerViews.map((serverView) => ({
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

app.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PostBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    const { mcpServerId } = c.req.valid("json");

    if (!auth.isAdmin()) {
      return c.json(
        {
          error: {
            type: "mcp_auth_error",
            message: "User is not authorized to add tools to a space.",
          },
        },
        403
      );
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Can only create MCP Server Views from regular or global spaces.",
          },
        },
        400
      );
    }

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        mcpServerId
      );

    if (!systemView) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Missing system view for MCP server, it should have been created when adding the tool.",
          },
        },
        400
      );
    }

    const { hasConflict, name } =
      await MCPServerViewResource.hasNameConflictInSpace(
        auth,
        systemView,
        space
      );

    if (hasConflict) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: `An existing Tool is already using the name "${name}"`,
          },
        },
        400
      );
    }

    const { view: serverView, affectedAgents } =
      await MCPServerViewResource.create(auth, {
        systemView,
        space,
      });
    const affectedAgentNames = affectedAgents?.map((agent) => agent.name) ?? [];

    if (space.kind === "global" && affectedAgentNames.length > 0) {
      const toolName = getMcpServerViewDisplayName(systemView.toJSON());

      await notifyWorkspaceAdminsAboutAffectedAgents(auth, {
        toolName,
        agentNames: affectedAgentNames,
      });
    }

    return c.json({
      success: true,
      serverView: serverView.toJSON(),
    });
  }
);

// Register `/not_activated` BEFORE `/:svId` so the param route does not
// swallow "not_activated" as an id.
app.route("/not_activated", notActivated);
app.route("/:svId", svId);

export default app;
