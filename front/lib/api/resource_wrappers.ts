import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const RESOURCE_KEYS = ["space", "dataSource", "dataSourceView"] as const;

type ResourceKey = (typeof RESOURCE_KEYS)[number];

// This is a type that represents the resources that can be extracted from an API route
type KeyToResource = {
  space: SpaceResource;
  dataSource: DataSourceResource;
  dataSourceView: DataSourceViewResource;
};

type ResourceMap<U extends ResourceKey> = {
  [K in U]: KeyToResource[K];
};

type OptionsMap<U extends ResourceKey> = {
  [K in U]: {
    requireCanReadOrAdministrate?: boolean;
    requireCanAdministrate?: boolean;
    requireCanRead?: boolean;
    requireCanWrite?: boolean;
  };
};

// Resolvers must be in reverse order : last one is applied first.
const resolvers = [
  withDataSourceViewFromRoute,
  withDataSourceFromRoute,
  withSpaceFromRoute,
];

type SessionOrKeyAuthType = Authenticator | SessionWithUser | null;

type ResourceResolver<T, A extends SessionOrKeyAuthType> = (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  auth: Authenticator,
  resources: Partial<ResourceMap<ResourceKey>>,
  options: Partial<OptionsMap<ResourceKey>>,
  sessionOrKeyAuth: A
) => Promise<void> | void;

type HandlerWithResources<
  T,
  A extends SessionOrKeyAuthType,
  U extends ResourceKey,
> = (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  auth: Authenticator,
  resources: ResourceMap<U>,
  sessionOrKeyAuth: A
) => Promise<void> | void;

function isResourceMap<U extends ResourceKey>(
  obj: any,
  keys: ResourceKey[]
): obj is ResourceMap<U> {
  return keys.every((key) => key in obj);
}

function spaceCheck(space: SpaceResource | null): space is SpaceResource {
  return (space && !space.isConversations()) ?? false;
}

function hasPermission(
  auth: Authenticator,
  resource: SpaceResource | DataSourceResource | DataSourceViewResource,
  options:
    | {
        requireCanAdministrate?: boolean;
        requireCanReadOrAdministrate?: boolean;
        requireCanRead?: boolean;
        requireCanWrite?: boolean;
      }
    | true
    | undefined
) {
  if (typeof options === "object") {
    if (
      (options.requireCanAdministrate === true &&
        !resource.canAdministrate(auth)) ||
      (options.requireCanReadOrAdministrate === true &&
        !resource.canReadOrAdministrate(auth)) ||
      (options.requireCanRead === true && !resource.canRead(auth)) ||
      (options.requireCanWrite === true && !resource.canWrite(auth))
    ) {
      return false;
    }
  }
  return true;
}

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
>(
  handler: HandlerWithResources<T, A, U>,
  options: OptionsMap<U>
): (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  auth: Authenticator,
  sessionOrKeyAuth: A
) => Promise<void> | void {
  const wrappedHandler = resolvers.reduce(
    (acc, resolver) => resolver(acc),
    (
      req: NextApiRequest,
      res: NextApiResponse<WithAPIErrorResponse<T>>,
      auth: Authenticator,
      resources: Partial<ResourceMap<ResourceKey>>,
      options: Partial<OptionsMap<ResourceKey>>,
      sessionOrKeyAuth: A
    ) => {
      const keys = RESOURCE_KEYS.filter((key) => key in options);
      if (!isResourceMap<U>(resources, keys)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid parameters.",
          },
        });
      }
      return handler(req, res, auth, resources, sessionOrKeyAuth);
    }
  );

  return (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    sessionOrKeyAuth: A
  ) => wrappedHandler(req, res, auth, {}, options, sessionOrKeyAuth);
}

/**
 *  for /w/[wId]/spaces/[spaceId]/... => check the space exists, that it's
 *  not a conversation space, etc. and provide the space resource to the handler.
 */
function withSpaceFromRoute<T, A extends SessionOrKeyAuthType>(
  handler: ResourceResolver<T, A>
): ResourceResolver<T, A> {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    resources: Partial<ResourceMap<ResourceKey>>,
    options: Partial<OptionsMap<ResourceKey>>,
    sessionOrKeyAuth: A
  ) => {
    const { spaceId } = req.query;

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (spaceId || options.space) {
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

      if (!spaceCheck(space) || !hasPermission(auth, space, options.space)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "The space you requested was not found.",
          },
        });
      }

      return handler(
        req,
        res,
        auth,
        { ...resources, space },
        options,
        sessionOrKeyAuth
      );
    }

    return handler(req, res, auth, resources, options, sessionOrKeyAuth);
  };
}

/**
 * for /w/[wId]/spaces/[spaceId]/data_source/[dsId]/ => check the data source exists,
 * that it's not in a conversation space, etc. and provide the data source resource to the handler.
 * also supports the legacy usage of connectors with /w/[wId]/data_source/[dsId]/
 */
function withDataSourceFromRoute<T, A extends SessionOrKeyAuthType>(
  handler: ResourceResolver<T, A>
): ResourceResolver<T, A> {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    resources: Partial<ResourceMap<ResourceKey>>,
    options: Partial<OptionsMap<ResourceKey>>,
    sessionOrKeyAuth: A
  ) => {
    const { dsId } = req.query;

    if (dsId) {
      if (typeof dsId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid path parameters.",
          },
        });
      }

      const dataSource = await DataSourceResource.fetchById(auth, dsId);

      const shouldKeepLegacyEndpointSupport =
        sessionOrKeyAuth === null || sessionOrKeyAuth instanceof Authenticator;

      if (!dataSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }

      let { space } = resources;

      if (!space) {
        if (shouldKeepLegacyEndpointSupport) {
          if (auth.isSystemKey()) {
            // We also handle the legacy usage of connectors that taps into connected data sources which
            // are not in the global space. If this is a system key we trust it and set the `spaceId` to the
            // dataSource.space.sId.
            space = dataSource.space;
          } else {
            space = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
          }
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid space id.",
            },
          });
        }
      }

      if (
        dataSource.space.sId !== space.sId ||
        !spaceCheck(space) ||
        !hasPermission(auth, dataSource, options.dataSource)
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }

      return handler(
        req,
        res,
        auth,
        { ...resources, space, dataSource },
        options,
        sessionOrKeyAuth
      );
    }

    return handler(req, res, auth, resources, options, sessionOrKeyAuth);
  };
}

/**
 * for /w/[wId]/spaces/[spaceId]/data_source_view/[dsvId]/ => check the data source exists,
 * that it's not in a conversation space, etc. and provide the data source resource to the handler.
 * also supports the legacy usage of connectors with /w/[wId]/data_source/[dsId]/
 */
function withDataSourceViewFromRoute<T, A extends SessionOrKeyAuthType>(
  handler: ResourceResolver<T, A>
): ResourceResolver<T, A> {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    resources: Partial<ResourceMap<ResourceKey>>,
    options: Partial<OptionsMap<ResourceKey>>,
    sessionOrKeyAuth: A
  ) => {
    const { dsvId } = req.query;

    if (dsvId) {
      if (typeof dsvId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid path parameters.",
          },
        });
      }

      const dataSourceView = await DataSourceViewResource.fetchById(
        auth,
        dsvId
      );

      const { space } = resources;
      if (!space) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid space id.",
          },
        });
      }

      if (
        !dataSourceView ||
        dataSourceView.space.sId !== space.sId ||
        !spaceCheck(space) ||
        !hasPermission(auth, dataSourceView, options.dataSourceView)
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_view_not_found",
            message: "The data source view you requested was not found.",
          },
        });
      }

      return handler(
        req,
        res,
        auth,
        { ...resources, dataSource: dataSourceView.dataSource, dataSourceView },
        options,
        sessionOrKeyAuth
      );
    }

    return handler(req, res, auth, resources, options, sessionOrKeyAuth);
  };
}
