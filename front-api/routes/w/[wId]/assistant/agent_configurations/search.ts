import { SearchAgentsQuerySchema } from "@app/lib/agent_search/query_schema";
import { searchAgentListings } from "@app/lib/api/agents/search_listing";
import logger from "@app/logger/logger";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/assistant/agent_configurations/search.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", SearchAgentsQuerySchema),
  async (ctx): HandlerResult<SearchAgentsResponseBody> => {
    const auth = ctx.get("auth");
    const {
      query,
      limit,
      offset,
      permissionFiltering,
      status,
      scope,
      tagIds,
      skillIds,
      mcpServerViewIds,
      editorIds: editorIdsFilter,
      modelIds,
      spaceIds,
      activeUsersCount,
      editedByMe,
      facets,
      sortBy,
      sortOrder,
    } = ctx.req.valid("json");
    const result = await searchAgentListings(auth, {
      searchTerm: query,
      limit,
      offset,
      sortBy,
      sortOrder,
      permissionFiltering,
      facets,
      filters: {
        status,
        scope,
        tagIds,
        skillIds,
        mcpServerViewIds,
        editorIds: editorIdsFilter,
        modelIds,
        spaceIds,
        activeUsersCount,
        editedByMe,
      },
    });

    if (result.isErr()) {
      if (result.error === "unrestricted_requires_admin") {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only admins can search all agents of the workspace.",
          },
        });
      }
      if (result.error === "offset_out_of_range") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Agent search offset is out of range",
          },
        });
      }
      logger.error(
        {
          error: result.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to search agents"
      );
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to search agents",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;
