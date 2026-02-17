import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  listWorkspaceConnectedMCPServerIds,
  oauthProviderRequiresWorkspaceConnectionForPersonalAuth,
  withWorkspaceConnectionRequirement,
} from "@app/lib/api/mcp_oauth_prerequisites";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
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

// We don't allow to fetch "auto_hidden_builder".
function isAllowedAvailability(
  availability: string
): availability is MCPViewsRequestAvailabilityType {
  return availability === "manual" || availability === "auto";
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServerViewsListResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const spaceIds = req.query.spaceIds;
      const availabilities = req.query.availabilities;

      if (!isString(spaceIds) || !isString(availabilities)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters",
          },
        });
      }

      const normalizedQuery = {
        ...req.query,
        spaceIds: spaceIds.split(","),
        availabilities: availabilities.split(","),
      };

      const r = GetMCPViewsRequestSchema.safeParse(normalizedQuery);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const query = r.data;

      if (auth.isAdmin()) {
        await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
      }

      const serverViews = await concurrentExecutor(
        query.spaceIds,
        async (spaceId) => {
          const space = await SpaceResource.fetchById(auth, spaceId);
          if (!space) {
            return null;
          }
          const views = await MCPServerViewResource.listBySpace(auth, space);
          return views.map((v) => v.toJSON());
        },
        { concurrency: 10 }
      );

      const flattenedServerViews = serverViews
        .flat()
        .filter((v): v is MCPServerViewType => v !== null)
        .filter(
          (v) =>
            isAllowedAvailability(v.server.availability) &&
            query.availabilities.includes(v.server.availability)
        );

      // Some OAuth providers require a workspace-level connection before users
      // can set up personal connections. We enrich the authorization info so the
      // client can block the OAuth popup and show an inline error instead.
      // The DB query is only made when at least one server in the list needs it.
      const needsWorkspaceConnectionEnrichment = flattenedServerViews.some(
        (v) =>
          v.server.authorization !== null &&
          oauthProviderRequiresWorkspaceConnectionForPersonalAuth(
            v.server.authorization.provider
          )
      );

      if (!needsWorkspaceConnectionEnrichment) {
        return res.status(200).json({
          success: true,
          serverViews: flattenedServerViews,
        });
      }

      const workspaceConnectedMCPServerIds =
        await listWorkspaceConnectedMCPServerIds(auth);

      return res.status(200).json({
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
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
