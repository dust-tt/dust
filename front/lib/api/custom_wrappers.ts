import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import type {
  RouteResourceMap,  RouteResourceName} from "@app/lib/api/auth_wrappers";
import {
  withSessionAuthenticationForWorkspace,
} from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

/*
 *  API routes containing resource strings that require some handling logic can
 *  use this wrapper to extract the resource, make the checks, apply the logic
 *  and then call the handler with the resource.
 *
 * e.g. for /w/[wId]/spaces/[spaceId]/... => check the space exists, that it's
 *  not a conversation space, etc. and provide the space resource to the handler.
 */

export function withInternalAPIRouteResource<T, U extends RouteResourceName>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    routeResource: RouteResourceMap[U],
    session: SessionWithUser
  ) => Promise<void> | void,
  resource: U
): (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>
) => Promise<void> {
  return withSessionAuthenticationForWorkspace(
    async (
      req: NextApiRequest,
      res: NextApiResponse<WithAPIErrorResponse<T>>,
      auth: Authenticator,
      session: SessionWithUser
    ) => {
      // Add space to routeParams if it is in the query
      if (resource === "space") {
        const { spaceId } = req.query;
        if (typeof spaceId !== "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid space id.",
            },
          });
        }

        const space = await SpaceResource.fetchById(auth, spaceId);
        if (!space || !space.canList(auth) || space.isConversations()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: "The space you requested was not found.",
            },
          });
        }
        return handler(req, res, auth, space, session);
      }
    }
  );
}
