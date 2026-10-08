import { updateSkillSuggestionsState } from "@app/lib/api/skills/update_skill_suggestions_state";
import { postSkillSuggestionStatusUpdate } from "@app/lib/reinforcement/aggregate_suggestions";
import { hasReinforcementEnabled } from "@app/lib/reinforcement/workspace_check";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
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
import uniq from "lodash/uniq";

// Mounted at /api/w/:wId/assistant/skills/:sId/suggestions.
// The `skill` context variable is set by the parent skills/[sId]/index.ts
// middleware, which also enforces `auth.can("admin", skill)`.
const app = skillApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSkillSuggestionsResponseBody> => {
  const auth = ctx.get("auth");
  const skill = ctx.get("skill");

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

  if (!(await hasReinforcementEnabled(auth))) {
    return ctx.json({ suggestions: [], referencedSkills: [] });
  }

  const suggestions = await SkillSuggestionResource.listBySkillConfigurationId(
    auth,
    skill.sId,
    {
      states,
      sources: ["reinforcement"],
      kinds: kind ? [kind] : undefined,
      limit: parsedLimit,
    }
  );

  const referencedSkills = await SkillResource.fetchByIds(
    auth,
    uniq(suggestions.flatMap((s) => s.getReferencedSkillIds())),
    {
      onlyActive: true,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    }
  );

  return ctx.json({
    suggestions: suggestions.map((s) => s.toJSON()),
    referencedSkills: referencedSkills.map((referencedSkill) => {
      const {
        instructions,
        instructionsHtml,
        tools,
        ...referencedSkillWithoutInstructionsAndTools
      } = referencedSkill.toJSON(auth);
      return referencedSkillWithoutInstructionsAndTools;
    }),
  });
});

app.patch(
  "/",
  validate("json", PatchSkillSuggestionRequestBodySchema),
  async (ctx): HandlerResult<PatchSkillSuggestionResponseBody> => {
    const auth = ctx.get("auth");
    const skill = ctx.get("skill");

    const { suggestionIds, state } = ctx.req.valid("json");

    if (!(await hasReinforcementEnabled(auth))) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Skill suggestions are not available in this workspace.",
        },
      });
    }

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

    const unavailableSuggestionIds = suggestions
      .filter((suggestion) => suggestion.source !== "reinforcement")
      .map((suggestion) => suggestion.sId);
    if (unavailableSuggestionIds.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The following skill suggestions are not available: ${unavailableSuggestionIds.join(", ")}.`,
        },
      });
    }

    const updateRes = await updateSkillSuggestionsState(
      auth,
      suggestions,
      state
    );
    if (updateRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: updateRes.error.message,
        },
      });
    }

    if (state === "approved" || state === "rejected") {
      await postSkillSuggestionStatusUpdate(auth, suggestions, state);
    }

    // Bulk update doesn't mutate the resources, so we need to refetch here.
    const updatedSuggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    return ctx.json({
      suggestions: updatedSuggestions.map((s): SkillSuggestionType =>
        s.toJSON()
      ),
    });
  }
);

export default app;
