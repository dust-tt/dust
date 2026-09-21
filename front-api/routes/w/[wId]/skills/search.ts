import { searchSkills } from "@app/lib/api/skills/search";
import { SearchSkillsQuerySchema } from "@app/lib/skill_search/query_schema";
import logger from "@app/logger/logger";
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
      cursor,
      permissionFiltering,
      status,
      mcpServerViewIds,
      availability,
      editedByMe,
      codeDefinedOnly,
      sortBy,
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
    const result = await searchSkills(auth, {
      searchTerm: query,
      limit,
      cursor,
      sortBy,
      permissionFiltering,
      filters: {
        status,
        mcpServerViewIds,
        availability,
        editedByMe,
        codeDefinedOnly,
      },
    });

    if (result.isErr()) {
      if (result.error === "invalid_cursor") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid skill search cursor",
          },
        });
      }
      logger.error(
        {
          error: result.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to search skills"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to search skills",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;
