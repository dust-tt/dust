import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { ProjectType } from "@app/types/space";
import type { NextApiRequest, NextApiResponse } from "next";

export type SearchProjectsResponseBody = {
  spaces: Array<ProjectType & { isMember: boolean }>;
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
    maxLimit: 100,
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

  const metadataMap = new Map(projectsWithMetadata.map((p) => [p.sId, p]));

  const results = [];
  for (const space of projectSpaces) {
    const metadata = metadataMap.get(space.sId);
    if (!metadata) {
      logger.warn({ spaceId: space.sId }, "Missing metadata for project");
      continue;
    }
    results.push({ ...metadata, isMember: space.isMember(auth) });
  }

  return res.status(200).json({
    spaces: results,
    hasMore,
    lastValue,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
