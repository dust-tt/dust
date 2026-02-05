import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { default as config } from "@app/lib/api/config";
import { fetchProjectDataSourceView } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";
import { CoreAPI, dustManagedCredentials } from "@app/types";

interface ProjectWithScore {
  space: SpaceType;
  score: number;
}

export type SearchProjectsResponseBody = {
  projects: ProjectWithScore[];
};

const SearchProjectsQuerySchema = z.object({
  query: z.string().optional().default(""),
});

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

  const queryValidation = SearchProjectsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { query } = queryValidation.data;

  // Get all accessible project spaces
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });
  const projectSpaces = spaces.filter((s) => s.kind === "project");

  if (projectSpaces.length === 0) {
    return res.status(200).json({ projects: [] });
  }

  // When query is empty, return all accessible projects sorted alphabetically
  if (!query.trim()) {
    const sortedProjects = [...projectSpaces].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const limitedResults = sortedProjects.map((space) => ({
      space: space.toJSON(),
      score: 1,
    }));
    return res.status(200).json({ projects: limitedResults });
  }

  const projectDataSourceViews = await concurrentExecutor(
    projectSpaces,
    async (space) => {
      const result = await fetchProjectDataSourceView(auth, space);
      if (result.isErr()) {
        return null;
      }
      return { space, dataSourceView: result.value };
    },
    { concurrency: 10 }
  );

  const validProjects = projectDataSourceViews.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );

  if (validProjects.length === 0) {
    return res.status(200).json({ projects: [] });
  }

  const searches = validProjects.map(({ dataSourceView }) => ({
    projectId: dataSourceView.dataSource.dustAPIProjectId,
    dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
    view_filter: dataSourceView.toViewFilter(),
  }));

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = dustManagedCredentials();

  const searchResult = await coreAPI.bulkSearchDataSources(
    query,
    1,
    credentials,
    false,
    searches
  );

  if (searchResult.isErr()) {
    logger.error(
      {
        error: searchResult.error,
        workspaceId: auth.getNonNullableWorkspace().sId,
        query,
      },
      "Failed to bulk search project data sources"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to search projects.",
      },
    });
  }

  const dataSourceIdToSpace = new Map<string, SpaceResource>();
  for (const { space, dataSourceView } of validProjects) {
    dataSourceIdToSpace.set(
      dataSourceView.dataSource.dustAPIDataSourceId,
      space
    );
  }

  const projectScores = new Map<string, number>();
  for (const doc of searchResult.value.documents) {
    const space = dataSourceIdToSpace.get(doc.data_source_id);
    if (!space) {
      continue;
    }

    const maxChunkScore = Math.max(
      ...doc.chunks.map((chunk) => chunk.score ?? 0),
      0
    );

    const currentMax = projectScores.get(space.sId) ?? 0;
    if (maxChunkScore > currentMax) {
      projectScores.set(space.sId, maxChunkScore);
    }
  }

  const projectsWithScores: ProjectWithScore[] = [];
  for (const [spaceSId, score] of projectScores.entries()) {
    if (score > 0) {
      const space = projectSpaces.find((s) => s.sId === spaceSId);
      if (space) {
        projectsWithScores.push({
          space: space.toJSON(),
          score,
        });
      }
    }
  }

  projectsWithScores.sort((a, b) => b.score - a.score);

  return res.status(200).json({ projects: projectsWithScores });
}

export default withSessionAuthenticationForWorkspace(handler);
