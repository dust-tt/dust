import type { SkillEditorsChangeError } from "@app/lib/api/skills/editors_change";
import { applySkillEditorsSuggestion } from "@app/lib/api/skills/editors_change";
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
import type { APIError } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { skillApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Maps the editors-change guard codes onto HTTP the way the manual `PATCH /skills/:sId/editors`
// route does; `apply_failed` is the only server-side failure.
function editorsChangeApiError(
  suggestionId: string,
  error: SkillEditorsChangeError
): { status_code: 400 | 403 | 404 | 500; api_error: APIError } {
  const message = `Could not apply suggestion ${suggestionId}: ${error.message}`;
  switch (error.code) {
    case "not_authorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message },
      };
    case "user_not_found":
      return {
        status_code: 404,
        api_error: { type: "user_not_found", message },
      };
    case "archived":
    case "user_not_member":
    case "space_access_denied":
    case "last_editor_removed":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message },
      };
    case "apply_failed":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message },
      };
    default:
      assertNever(error.code);
  }
}

// Mounted at /api/w/:wId/assistant/skills/:sId/suggestions.
// The `skill` context variable is set by the parent skills/[sId]/index.ts
// middleware, which also enforces canAdministrate.
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

    // Self-improving skills gate the reinforcement suggestions only; conversational suggestions
    // are reviewed whatever the workspace's reinforcement setting.
    const hasReinforcementSuggestions = suggestions.some(
      (s) => s.source !== "conversational"
    );
    if (hasReinforcementSuggestions && !(await hasReinforcementEnabled(auth))) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Self-improving skills are not enabled for this workspace.",
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

    // Editors suggestions are the only kind applied server-side (the builder applies edits on
    // save). Each one is re-validated against live state, applied, then approved on its own so an
    // applied change is never left `pending`; the rest of the batch follows the plain state flip.
    let others = suggestions;
    if (state === "approved") {
      others = [];
      for (const suggestion of suggestions) {
        if (suggestion.kind !== "editors") {
          others.push(suggestion);
          continue;
        }
        const applyRes = await applySkillEditorsSuggestion(
          auth,
          skill,
          suggestion
        );
        if (applyRes.isErr()) {
          return apiError(
            ctx,
            editorsChangeApiError(suggestion.sId, applyRes.error)
          );
        }
        await SkillSuggestionResource.bulkUpdateState(
          auth,
          [suggestion],
          "approved"
        );
      }
    }

    await SkillSuggestionResource.bulkUpdateState(auth, others, state);

    if (state === "approved" || state === "rejected") {
      await postSkillSuggestionStatusUpdate(auth, suggestions, state);
    }

    // Bulk update doesn't mutate the resources, so we need to refetch here.
    const updatedSuggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    // See `SkillSuggestionResource.toJSON`: `editors` rows have no public serialization yet, so
    // the response carries the `edit` rows only.
    return ctx.json({
      suggestions: updatedSuggestions
        .filter((s) => s.kind === "edit")
        .map((s): SkillSuggestionType => s.toJSON()),
    });
  }
);

export default app;
