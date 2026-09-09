import { searchResources } from "@app/lib/api/resource_search";
import { ResourceSearchCursorError } from "@app/lib/search/cursor";
import { ResourceSearchQuerySchema } from "@app/lib/search/query_schema";
import logger from "@app/logger/logger";
import type {
  ResourceSearchResponse,
  ResourceSearchResult,
} from "@app/types/api/resource_search";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const app = workspaceApp();

/**
 * @ignoreswagger
 * GET /api/w/:wId/search/resources returns one ranked, paginated stream of workspace
 * agents and custom/code-defined skills. Optional resourceTypes=skill,agent selects
 * indexes (both by default). Existing knowledge/tool search is unchanged.
 * query defaults to empty, mode to autocomplete, limit to 150 (1-150), and
 * permissionFiltering to strict. Admin-only redact_unreadable retains listing metadata
 * with canRead=false; no prompt content, tool configurations or files are returned.
 * Results contain type, resource (existing stripped skill/light agent shape), and score.
 * Optional comma-separated spaceIds/toolIds/availability/tagIds/skillIds are ORed within
 * each dimension and ANDed across dimensions; isDefault and editedByMe accept true/false.
 * tagIds/skillIds select agents; isDefault selects skills. ACLs remain independent.
 * Cursor UUIDs expire after five minutes and are bound to caller, workspace, query,
 * resource types, filters, mode and catalog. Invalid cursors return 400. A short/empty
 * page can still have nextCursor; null means exhausted. Non-admin redaction returns 403.
 */
app.get(
  "/",
  validate("query", ResourceSearchQuerySchema),
  async (ctx): HandlerResult<ResourceSearchResponse> => {
    const auth = ctx.get("auth");
    const {
      query,
      resourceTypes,
      mode,
      limit,
      cursor,
      permissionFiltering,
      spaceIds,
      toolIds,
      availability,
      isDefault,
      editedByMe,
      tagIds,
      skillIds,
    } = ctx.req.valid("query");
    if (permissionFiltering === "redact_unreadable" && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins can search unreadable skills and agents.",
        },
      });
    }
    const result = await searchResources(auth, {
      searchTerm: query,
      resourceTypes,
      mode,
      limit,
      cursor,
      permissionFiltering,
      filters: {
        spaceIds,
        toolIds,
        availability,
        isDefault,
        editedByMe,
        tagIds,
        skillIds,
      },
    });
    if (result.isErr()) {
      if (result.error instanceof ResourceSearchCursorError) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      }
      logger.error(
        {
          error: result.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to search skills and agents"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to search skills and agents",
        },
      });
    }
    const results = result.value.results.map((entry): ResourceSearchResult => {
      switch (entry.type) {
        case "skill":
          return {
            type: "skill",
            resource: entry.resource.toSearchListingJSON(auth),
            score: entry.score,
          };
        case "agent":
          return {
            type: "agent",
            resource: entry.resource,
            score: entry.score,
          };
        default:
          return assertNever(entry);
      }
    });
    return ctx.json({ results, nextCursor: result.value.nextCursor });
  }
);

export default app;
