/** @ignoreswagger */
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { sendMCPGlobalSharingReconfigurationEmail } from "@app/lib/api/email";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  listWorkspaceConnectedMCPServerIds,
  oauthProviderRequiresWorkspaceConnectionForPersonalAuth,
  withWorkspaceConnectionRequirement,
} from "@app/lib/api/mcp_oauth_prerequisites";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SpaceKind } from "@app/types/space";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetMCPServerViewsResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

export type PostMCPServerViewResponseBody = {
  success: boolean;
  serverView: MCPServerViewType;
};

const GetQueryParamsSchema = t.type({
  availability: t.union([
    t.undefined,
    t.literal("manual"),
    t.literal("auto"),
    t.literal("auto_hidden_builder"),
    t.literal("all"),
  ]),
});

const PostQueryParamsSchema = t.type({
  mcpServerId: t.string,
});

export type PostMCPServersQueryParams = t.TypeOf<typeof PostQueryParamsSchema>;

async function notifyWorkspaceAdminsAboutAffectedAgents(
  auth: Authenticator,
  {
    toolName,
    agentNames,
  }: {
    toolName: string;
    agentNames: string[];
  }
): Promise<void> {
  if (agentNames.length === 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const { members } = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });
  const adminEmails = Array.from(
    new Set(members.map((member) => member.email))
  );

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

  if (failedEmails.length > 0) {
    logger.error(
      {
        workspaceId: workspace.sId,
        toolName,
        agentNames,
        failedEmails,
      },
      "Failed to send MCP global sharing reconfiguration emails"
    );
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetMCPServerViewsResponseBody | PostMCPServerViewResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const r = GetQueryParamsSchema.decode(req.query);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        });
      }

      const { availability = "manual" } = r.right;

      const serverViews = (
        await MCPServerViewResource.listBySpace(auth, space)
      ).map((view) => view.toJSON());

      const filteredServerViews = serverViews.filter(
        (s) => availability === "all" || s.server.availability === availability
      );

      // Some OAuth providers require a workspace-level connection before users
      // can set up personal connections. We enrich the authorization info so the
      // client can block the OAuth popup and show an inline error instead.
      // The DB query is only made when at least one server in the list needs it.
      const needsWorkspaceConnectionEnrichment = filteredServerViews.some(
        (s) =>
          s.server.authorization !== null &&
          oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
            s.server.authorization.provider
          )
      );

      if (!needsWorkspaceConnectionEnrichment) {
        return res.status(200).json({
          success: true,
          serverViews: filteredServerViews,
        });
      }

      const workspaceConnectedMCPServerIds =
        await listWorkspaceConnectedMCPServerIds(auth);

      return res.status(200).json({
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
    case "POST": {
      const r = PostQueryParamsSchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        });
      }

      const { mcpServerId } = r.right;

      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "mcp_auth_error",
            message: "User is not authorized to add tools to a space.",
          },
        });
      }

      const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
      if (!allowedSpaceKinds.includes(space.kind)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Can only create MCP Server Views from regular or global spaces.",
          },
        });
      }

      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          mcpServerId
        );

      if (!systemView) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing system view for MCP server, it should have been created when adding the tool.",
          },
        });
      }

      const { hasConflict, name } =
        await MCPServerViewResource.hasNameConflictInSpace(
          auth,
          systemView,
          space
        );

      if (hasConflict) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `An existing Tool is already using the name "${name}"`,
          },
        });
      }

      const affectedAgentNames =
        space.kind === "global"
          ? await MCPServerViewResource.listLatestActiveAgentNamesToReconfigureOnGlobalShare(
              auth,
              mcpServerId
            )
          : [];

      const serverView = await MCPServerViewResource.create(auth, {
        systemView,
        space,
      });

      if (space.kind === "global" && affectedAgentNames.length > 0) {
        const toolName = getMcpServerViewDisplayName(systemView.toJSON());

        try {
          await notifyWorkspaceAdminsAboutAffectedAgents(auth, {
            toolName,
            agentNames: affectedAgentNames,
          });
        } catch (error) {
          logger.error(
            {
              error,
              workspaceId: auth.getNonNullableWorkspace().sId,
              toolName,
              agentNames: affectedAgentNames,
            },
            "Failed to notify workspace admins about MCP global sharing impact"
          );
        }
      }

      return res.status(200).json({
        success: true,
        serverView: serverView.toJSON(),
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
