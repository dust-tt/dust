import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

interface ProjectSpace {
  space: SpaceType;
  isMember: boolean;
}

export type SearchProjectsResponseBody = {
  spaces: ProjectSpace[];
  hasMore: boolean;
  lastValue: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchProjectsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const paginationRes = getPaginationParams(req, {
    defaultLimit: 20,
    defaultOrderColumn: "name",
    defaultOrderDirection: "asc",
    supportedOrderColumn: ["name"],
  });

  if (paginationRes.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const { query } = req.query;
  const queryString = isString(query) ? query : undefined;
  const pagination = paginationRes.value;

  // Fetch paginated projects with SQL ordering/filtering.
  const {
    spaces: projectSpaces,
    hasMore,
    lastValue,
  } = await SpaceResource.searchProjectsByNamePaginated(auth, {
    query: queryString,
    pagination: {
      limit: pagination.limit,
      lastValue: pagination.lastValue,
      orderDirection: pagination.orderDirection,
    },
  });

  const projectsWithMetadata = await enrichProjectsWithMetadata(
    auth,
    projectSpaces
  );

  const results = projectsWithMetadata.map(({ space, description }) => ({
    space: {
      ...space.toJSON(),
      description: description ?? undefined,
    } satisfies SpaceType,
    isMember: space.isMember(auth),
  }));

  return res.status(200).json({
    spaces: results,
    hasMore,
    lastValue,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
