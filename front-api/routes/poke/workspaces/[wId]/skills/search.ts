import { searchSkillListings } from "@app/lib/api/skills/search_listing";
import { SearchSkillsQuerySchema } from "@app/lib/skill_search/query_schema";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/poke/workspaces/:wId/skills/search.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", SearchSkillsQuerySchema),
  async (ctx): HandlerResult<SearchSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const {
      query,
      limit,
      offset,
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
    const result = await searchSkillListings(auth, {
      searchTerm: query,
      permissionFiltering: "redact_unreadable",
      limit,
      offset,
      sortBy,
      sortOrder,
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
