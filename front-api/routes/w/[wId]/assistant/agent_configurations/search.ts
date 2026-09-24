import { SearchAgentsQuerySchema } from "@app/lib/agent_search/query_schema";
import { searchAgents } from "@app/lib/api/agents/search";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/w/:wId/assistant/agent_configurations/search.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withFeatureFlag("agents_search"),
  validate("json", SearchAgentsQuerySchema),
  async (ctx): HandlerResult<SearchAgentsResponseBody> => {
    const auth = ctx.get("auth");
    const {
      query,
      limit,
      cursor,
      status,
      scope,
      tagIds,
      skillIds,
      mcpServerViewIds,
      editedByMe,
      sortBy,
      sortOrder,
    } = ctx.req.valid("json");
    const result = await searchAgents(auth, {
      searchTerm: query,
      limit,
      cursor,
      sortBy,
      sortOrder,
      filters: {
        status,
        scope,
        tagIds,
        skillIds,
        mcpServerViewIds,
        editedByMe,
      },
    });

    if (result.isErr()) {
      if (result.error === "invalid_cursor") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid agent search cursor",
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to search agents",
        },
      });
    }

    const editorIds = [
      ...new Set(result.value.agents.flatMap((agent) => agent.editorIds)),
    ];
    const users = await UserResource.fetchByIds(editorIds);

    const editorsById = new Map(
      users.map((user) => {
        const { sId, fullName, image } = user.toJSON();
        return [sId, { sId, fullName, image }];
      })
    );

    return ctx.json({
      ...result.value,
      agents: result.value.agents.map((agent) => ({
        ...agent,
        editors: removeNulls(
          [...new Set(agent.editorIds)].map((id) => editorsById.get(id))
        ),
      })),
    });
  }
);

export default app;
