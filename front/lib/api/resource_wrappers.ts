import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
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
  [K in ResourceKey]: <T, A extends SessionOrKeyAuthType>(
    handler: ResourceHandler<T, K, A>
  ) => (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    sessionOrKeyAuthType: A
  ) => Promise<void> | void;
} = {
  space: withSpaceFromRoute,
};

type SessionOrKeyAuthType = Authenticator | SessionWithUser | null;

type ResourceHandler<
  T,
  U extends ResourceKey,
  A extends SessionOrKeyAuthType,
> = (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  auth: Authenticator,
  routeResource: ResourceMap[U],
  sessionOrKeyAuth: A
) => Promise<void> | void;

/*
 *  API routes containing resource strings that require some handling logic can
 *  use this wrapper to extract the resource, make the checks, apply the logic
 *  and then call the handler with the resource.
 *
 *  see e.g. `withSpaceFromRoute` below
 */
export function withResourceFetchingFromRoute<
  T,
  U extends ResourceKey,
  A extends SessionOrKeyAuthType,
>(handler: ResourceHandler<T, U, A>, resource: U) {
  return resolver[resource](handler);
}

/**
 *  for /w/[wId]/spaces/[spaceId]/... => check the space exists, that it's
 *  not a conversation space, etc. and provide the space resource to the handler.
 */
function withSpaceFromRoute<T, A extends SessionOrKeyAuthType>(
  handler: ResourceHandler<T, "space", A>
) {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    sessionOrKeyAuth: A
  ) => {
    const { spaceId } = req.query;

    // Handling the case where `spaceId` is undefined to keep support for the
    // legacy endpoint for v1 routes (global space assumed in that case).
    const shouldKeepLegacyEndpointSupport =
      sessionOrKeyAuth === null || sessionOrKeyAuth instanceof Authenticator;

    if (typeof spaceId !== "string" && !shouldKeepLegacyEndpointSupport) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid space id.",
        },
      });
    }

    const space =
      shouldKeepLegacyEndpointSupport && typeof spaceId !== "string"
        ? await SpaceResource.fetchWorkspaceGlobalSpace(auth)
        : // casting is fine since conditions checked above exclude
          // possibility of `spaceId` being undefined
          await SpaceResource.fetchById(auth, spaceId as string);

    if (!space || !space.canList(auth) || space.isConversations()) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you requested was not found.",
        },
      });
    }
    return handler(req, res, auth, space, sessionOrKeyAuth);
  };
}
