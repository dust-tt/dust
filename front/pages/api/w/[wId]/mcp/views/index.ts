import type { MCPViewsRequestAvailabilityType } from "@dust-tt/client";
import { GetMCPViewsRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServerViewsListResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

// We don't allow to fetch "auto_hidden_builder".
const isAllowedAvailability = (
  availability: string
): availability is MCPViewsRequestAvailabilityType => {
  return availability === "manual" || availability === "auto";
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServerViewsListResponseBody>>,
  auth: Authenticator
) {
  const { method } = req;

  switch (method) {
    case "GET": {
      if (
        typeof req.query.spaceIds !== "string" ||
        typeof req.query.availabilities !== "string"
      ) {
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
        spaceIds: req.query.spaceIds.split(","),
        availabilities: req.query.availabilities.split(",")
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

      return res.status(200).json({
        success: true,
        serverViews: flattenedServerViews,
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
