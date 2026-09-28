import { searchSkillListings } from "@app/lib/api/skills/search_listing";
import { SearchSkillsQuerySchema } from "@app/lib/skill_search/query_schema";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/w/:wId/skills/search.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withFeatureFlag("skills_search"),
  validate("json", SearchSkillsQuerySchema),
  async (ctx): HandlerResult<SearchSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const {
      query,
      limit,
      offset,
      permissionFiltering,
      status,
      mcpServerViewIds,
      availability,
      editedByMe,
      codeDefinedOnly,
      editorIds,
      childSkillIds,
      spaceIds,
      activeUsersCount,
      facets,
      sortBy,
      sortOrder,
    } = ctx.req.valid("json");
    if (permissionFiltering === "redact_unreadable" && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins can search unreadable skills.",
        },
      });
    }
    const result = await searchSkillListings(auth, {
      searchTerm: query,
      limit,
      offset,
      sortBy,
      sortOrder,
      permissionFiltering,
      facets,
      filters: {
        status,
        mcpServerViewIds,
        availability,
        editedByMe,
        codeDefinedOnly,
        editorIds,
        childSkillIds,
        spaceIds,
        activeUsersCount,
      },
    });

    if (result.isErr()) {
      if (result.error === "offset_out_of_range") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Skill search offset is out of range",
          },
        });
      }
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to search skills",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;
