import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

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
  [K in U]: Record<string, string | boolean | number> | boolean;
};

type ResourceKey = keyof KeyToResource;

// Resolvers must be in reverse order : last one is applied first.
const resolvers = [
  withDataSourceViewFromRoute,
  withDataSourceFromRoute,
  withSpaceFromRoute,
];

type SessionOrKeyAuthType = Authenticator | SessionWithUser | null;

type ResourceHandler<T, A extends SessionOrKeyAuthType> = (
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  auth: Authenticator,
  resources: Partial<ResourceMap<ResourceKey>>,
  options: Partial<OptionsMap<ResourceKey>>,
  sessionOrKeyAuth: A
) => Promise<void> | void;

function isResourceMap<U extends ResourceKey>(
  obj: any,
  keys: ResourceKey[]
): obj is ResourceMap<U> {
  return keys.every((key) => key in obj);
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
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    resources: ResourceMap<U>,
    sessionOrKeyAuth: A
  ) => Promise<void> | void,
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
      _: Partial<OptionsMap<ResourceKey>>,
      sessionOrKeyAuth: A
    ) => {
      const keys = Object.keys(options) as ResourceKey[];
      if (!isResourceMap<U>(resources, keys)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid parameters.",
          },
        });
      }
      return handler(
        req,
        res,
        auth,
        resources as ResourceMap<U>,
        sessionOrKeyAuth
      );
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
  handler: ResourceHandler<T, A>
): ResourceHandler<T, A> {
  return async (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    resources: Partial<ResourceMap<ResourceKey>>,
    options: Partial<OptionsMap<ResourceKey>>,
    sessionOrKeyAuth: A
  ) => {
    const { spaceId } = req.query;

    if (spaceId) {
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

      if (!space || space.isConversations()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "The space you requested was not found.",
          },
        });
      }

      const opts = options.space;
      if (typeof opts === "object") {
        if (
          (opts.requireCanRead === true && !space.canRead(auth)) ||
          (opts.requireCanList === true && !space.canList(auth))
        ) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: "The space you requested was not found.",
            },
          });
        }
      }

      resources.space = space;
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
  handler: ResourceHandler<T, A>
): ResourceHandler<T, A> {
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
      const { wId } = req.query;
      if (typeof dsId !== "string" || typeof wId !== "string") {
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

        resources.space = space;
      }

      if (dataSource.space.sId !== space.sId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }

      if (!dataSource.space || dataSource.space.isConversations()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }

      const opts = options.dataSource;
      if (typeof opts === "object") {
        if (
          (opts.requireCanRead === true && !dataSource.canRead(auth)) ||
          (opts.requireCanList === true && !dataSource.canList(auth))
        ) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "data_source_not_found",
              message: "The data source you requested was not found.",
            },
          });
        }
      }

      resources.dataSource = dataSource;
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
  handler: ResourceHandler<T, A>
): ResourceHandler<T, A> {
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

      let { space } = resources;
      if (!space) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid space id.",
          },
        });
      }

      if (!dataSourceView || dataSourceView.space.sId !== space.sId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_view_not_found",
            message: "The data source view you requested was not found.",
          },
        });
      }

      const opts = options.dataSourceView;
      if (typeof opts === "object") {
        if (
          (opts.requireCanRead === true && !dataSourceView.canRead(auth)) ||
          (opts.requireCanList === true && !dataSourceView.canList(auth))
        ) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "data_source_view_not_found",
              message: "The data source view you requested was not found.",
            },
          });
        }
      }

      resources.dataSourceView = dataSourceView;
      resources.dataSource = dataSourceView.dataSource;
    }

    return handler(req, res, auth, resources, options, sessionOrKeyAuth);
  };
}
