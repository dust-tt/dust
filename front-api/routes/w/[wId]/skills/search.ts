import { searchSkillsForCommandMenu } from "@app/lib/api/skills/search";
import { SkillSearchCursorError } from "@app/lib/skill_search/cursor";
import { MAX_SKILL_SEARCH_RESULTS } from "@app/lib/skill_search/search";
import logger from "@app/logger/logger";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const SearchSkillsQuerySchema = z.object({
  query: z.string().max(200).optional().default(""),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SKILL_SEARCH_RESULTS)
    .optional(),
  cursor: z.string().uuid().optional(),
});

// Mounted at /api/w/:wId/skills/search.
const app = workspaceApp();

/**
 * @ignoreswagger
 * Optional limit/cursor paginate one ranked stream of custom and code-defined
 * skills. The response adds nextCursor (null when exhausted) and per-hit score.
 * Cursors expire after five minutes; an invalid/expired cursor returns 400.
 * ACL filtering may produce a short or empty page with a continuation cursor.
 */
app.get(
  "/",
  validate("query", SearchSkillsQuerySchema),
  async (ctx): HandlerResult<SearchSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { query, limit, cursor } = ctx.req.valid("query");
    const result = await searchSkillsForCommandMenu(auth, {
      searchTerm: query,
      limit,
      cursor,
    });

    if (result.isErr()) {
      if (result.error instanceof SkillSearchCursorError) {
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
