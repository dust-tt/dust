import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";

interface ProjectSpace {
  space: SpaceType;
  isMember: boolean;
}

export type SearchSpacesResponseBody = {
  spaces: ProjectSpace[];
  hasMore: boolean;
  lastValue: string | null;
};

const SearchSpacesQuerySchema = z.object({
  query: z.string().optional().default(""),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  lastValue: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchSpacesResponseBody>>,
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

  const queryValidation = SearchSpacesQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { query, limit, lastValue } = queryValidation.data;

  // Get all accessible project spaces, filtering by name if query is provided
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });

  // Filter to project spaces and apply name search
  let projectSpaces = spaces.filter((s) => s.kind === "project");

  if (query.trim()) {
    const lowerQuery = query.toLowerCase();
    projectSpaces = projectSpaces.filter((s) =>
      s.name.toLowerCase().includes(lowerQuery)
    );
  }

  // Sort alphabetically by name
  projectSpaces.sort((a, b) => a.name.localeCompare(b.name));

  if (projectSpaces.length === 0) {
    return res
      .status(200)
      .json({ spaces: [], hasMore: false, lastValue: null });
  }

  // Fetch project metadata (descriptions) for all project spaces
  const metadataResults = await concurrentExecutor(
    projectSpaces,
    async (space) => {
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      return { spaceId: space.id, metadata };
    },
    { concurrency: 10 }
  );
  const metadataBySpaceId = new Map(
    metadataResults
      .filter((r) => r.metadata !== null)
      .map((r) => [r.spaceId, r.metadata])
  );

  // Find the starting index based on lastValue
  let startIndex = 0;
  if (lastValue) {
    const lastValueIndex = projectSpaces.findIndex((s) => s.sId === lastValue);
    if (lastValueIndex !== -1) {
      startIndex = lastValueIndex + 1;
    }
  }

  // Take limit + 1 to determine if there are more results
  const paginatedSpaces = projectSpaces.slice(
    startIndex,
    startIndex + limit + 1
  );
  const hasMore = paginatedSpaces.length > limit;
  const resultsToReturn = hasMore
    ? paginatedSpaces.slice(0, limit)
    : paginatedSpaces;

  const results = resultsToReturn.map((space) => ({
    space: {
      ...space.toJSON(),
      description: metadataBySpaceId.get(space.id)?.description ?? undefined,
    },
    isMember: space.isMember(auth),
  }));

  const lastReturnedSpace = resultsToReturn[resultsToReturn.length - 1];

  return res.status(200).json({
    spaces: results,
    hasMore,
    lastValue: lastReturnedSpace?.sId ?? null,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
