import { postSkillSuggestionStatusUpdate } from "@app/lib/reinforcement/aggregate_suggestions";
import { hasReinforcementEnabled } from "@app/lib/reinforcement/workspace_check";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type {
  GetSkillSuggestionsResponseBody,
  PatchSkillSuggestionResponseBody,
} from "@app/types/api/assistant/skills/suggestions";
import {
  GetSkillSuggestionsQuerySchema,
  PatchSkillSuggestionRequestBodySchema,
} from "@app/types/api/assistant/skills/suggestions";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { skillApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/assistant/skills/:sId/suggestions.
// The `skill` context variable is set by the parent skills/[sId]/index.ts
// middleware, which also enforces canWrite.
const app = skillApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSkillSuggestionsResponseBody> => {
  const auth = ctx.get("auth");
  const skill = ctx.get("skill");

  if (!(await hasReinforcementEnabled(auth))) {
    return ctx.json({ suggestions: [] });
  }

  // Hono path-param fetch returns single-value query; for `states` we want all
  // repeats too. Build the input object explicitly.
  const queryInput = {
    states: ctx.req.queries("states"),
    kind: ctx.req.query("kind"),
    limit: ctx.req.query("limit"),
  };
  const queryValidation = GetSkillSuggestionsQuerySchema.safeParse(queryInput);
  if (!queryValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${queryValidation.error.message}`,
      },
    });
  }

  const { states, kind, limit } = queryValidation.data;

  const parsedLimit = limit ? parseInt(limit, 10) : undefined;
  if (parsedLimit !== undefined && isNaN(parsedLimit)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid limit parameter: must be a number",
      },
    });
  }

  const suggestions = await SkillSuggestionResource.listBySkillConfigurationId(
    auth,
    skill.sId,
    {
      states,
      sources: ["reinforcement"],
      kind,
      limit: parsedLimit,
    }
  );

  return ctx.json({ suggestions: suggestions.map((s) => s.toJSON()) });
});

app.patch(
  "/",
  validate("json", PatchSkillSuggestionRequestBodySchema),
  async (ctx): HandlerResult<PatchSkillSuggestionResponseBody> => {
    const auth = ctx.get("auth");
    const skill = ctx.get("skill");

    if (!(await hasReinforcementEnabled(auth))) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Self-improving skills are not enabled for this workspace.",
        },
      });
    }

    const { suggestionIds, state } = ctx.req.valid("json");

    const suggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    if (suggestions.length !== suggestionIds.length) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_suggestion_not_found",
          message: "One or more skill suggestions were not found.",
        },
      });
    }

    for (const suggestion of suggestions) {
      if (suggestion.skillConfigurationSId !== skill.sId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "One or more skill suggestions do not belong to the specified skill configuration.",
          },
        });
      }
    }

    await SkillSuggestionResource.bulkUpdateState(auth, suggestions, state);

    if (state === "approved" || state === "rejected") {
      await postSkillSuggestionStatusUpdate(auth, suggestions, state);
    }

    // Bulk update doesn't mutate the resources, so we need to refetch here.
    const updatedSuggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    return ctx.json({
      suggestions: updatedSuggestions.map(
        (s): SkillSuggestionType => s.toJSON()
      ),
    });
  }
);

export default app;
