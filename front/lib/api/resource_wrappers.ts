import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

// This is a type that represents the resources that can be extracted from an API route
type KeyToResource = {
  space: SpaceResource;
};

type ResourceMap = { [K in ResourceKey]: KeyToResource[K] };

type ResourceKey = keyof KeyToResource;

const resolver: {
  [K in ResourceKey]: <T>(
    handler: ResourceHandler<T, K>
  ) => (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    session: SessionWithUser
  ) => Promise<void> | void;
} = {
  space: withSpaceFromRoute,
};

type ResourceHandler<T, U extends ResourceKey> = (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  auth: Authenticator,
  routeResource: ResourceMap[U],
  session: SessionWithUser
) => Promise<void> | void;

/*
 *  API routes containing resource strings that require some handling logic can
 *  use this wrapper to extract the resource, make the checks, apply the logic
 *  and then call the handler with the resource.
 *
 *  see e.g. `withSpaceFromRoute` below
 */
export function withResourceFetchingFromRoute<T, U extends ResourceKey>(
  handler: ResourceHandler<T, U>,
  resource: U
) {
  return resolver[resource](handler);
}

/**
 *  for /w/[wId]/spaces/[spaceId]/... => check the space exists, that it's
 *  not a conversation space, etc. and provide the space resource to the handler.
 */
function withSpaceFromRoute<T>(handler: ResourceHandler<T, "space">) {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    session: SessionWithUser
  ) => {
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
  };
}
