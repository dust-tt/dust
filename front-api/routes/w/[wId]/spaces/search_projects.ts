import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { getPaginationParams } from "@app/lib/api/pagination";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";

// Mounted under /api/w/:wId/spaces/search_projects.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const paginationRes = getPaginationParams(c.req.query(), {
    defaultLimit: 20,
    defaultOrderColumn: "name",
    defaultOrderDirection: "asc",
    supportedOrderColumn: ["name"],
    maxLimit: 100,
  });

  if (paginationRes.isErr()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const queryString = c.req.query("query");
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

  return c.json({
    spaces: results,
    hasMore,
    lastValue,
  });
});

export default app;
