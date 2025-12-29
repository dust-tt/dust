import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WhitelistableFeature, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

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
const isAllowedAvailability = (
  availability: string,
  serverView: MCPServerViewType,
  {
    featureFlags,
  }: {
    featureFlags: WhitelistableFeature[];
  }
): availability is MCPViewsRequestAvailabilityType => {
  // TODO(skills-GA): Remove this check once skills are GA.
  // When skills feature flag is enabled, treat interactive_content and deep_dive as auto_hidden_builder
  // since they are exposed through skills instead.
  if (featureFlags.includes("skills")) {
    const serverName = getInternalMCPServerNameFromSId(serverView.server.sId);
    if (serverName === "interactive_content" || serverName === "deep_dive") {
      return false;
    }
  }

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

      const featureFlags = await getFeatureFlags(
        auth.getNonNullableWorkspace()
      );

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
            isAllowedAvailability(v.server.availability, v, { featureFlags }) &&
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
