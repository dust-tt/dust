import { SearchAgentsQuerySchema } from "@app/lib/agent_search/query_schema";
import { searchAgents } from "@app/lib/api/agents/search";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { removeNulls } from "@app/types/shared/utils/general";
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
      editedByMe,
      facets,
      sortBy,
      sortOrder,
    } = ctx.req.valid("json");
    const result = await searchAgents(auth, {
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

    const { facets: facetValues } = result.value;
    const editorIds = [
      ...new Set([
        ...result.value.agents.flatMap((agent) => agent.editorIds),
        ...(facetValues.editors ?? []),
      ]),
    ];
    const [users, tags] = await Promise.all([
      UserResource.fetchByIds(editorIds),
      facetValues.tags?.length
        ? TagResource.fetchByIds(auth, facetValues.tags)
        : [],
    ]);

    const editorsById = new Map(
      users.map((user) => {
        const { sId, fullName, image } = user.toJSON();
        return [sId, { sId, fullName, image }];
      })
    );

    return ctx.json({
      ...result.value,
      facets: {
        ...(facetValues.editors
          ? {
              editors: removeNulls(
                facetValues.editors.map((id) => editorsById.get(id))
              ).toSorted((a, b) => a.fullName.localeCompare(b.fullName)),
            }
          : {}),
        ...(facetValues.models ? { models: facetValues.models } : {}),
        ...(facetValues.tags
          ? {
              tags: tags
                .map((tag) => tag.toJSON())
                .toSorted((a, b) => a.name.localeCompare(b.name)),
            }
          : {}),
      },
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
