import { searchSkillsForCommandMenu } from "@app/lib/api/skills/search";
import logger from "@app/logger/logger";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const SearchSkillsQuerySchema = z.object({
  query: z.string().max(200).optional().default(""),
});

// Mounted at /api/w/:wId/skills/search.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SearchSkillsQuerySchema),
  async (ctx): HandlerResult<SearchSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { query } = ctx.req.valid("query");
    const result = await searchSkillsForCommandMenu(auth, {
      searchTerm: query,
    });

    if (result.isErr()) {
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

    return ctx.json({ skills: result.value });
  }
);

export default app;
