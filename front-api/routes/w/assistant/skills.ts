import { Hono } from "hono";
import { z } from "zod";

import { postSkillSuggestionStatusUpdate } from "@app/lib/reinforcement/aggregate_suggestions";
import { hasReinforcementEnabled } from "@app/lib/reinforcement/workspace_check";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { SkillSuggestionSchema } from "@app/types/suggestions/skill_suggestion";

import { validate } from "../../../middleware/validator";

declare module "hono" {
  interface ContextVariableMap {
    skill: SkillResource;
  }
}

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

const GetSkillSuggestionsQuerySchema = z.object({
  // Hono returns query params as strings; accept comma-separated or repeated.
  states: z
    .preprocess((v) => (typeof v === "string" ? [v] : v), z.array(StateSchema))
    .optional(),
  kind: z.enum(["edit"]).optional(),
  limit: z.string().optional(),
});

export type GetSkillSuggestionsQuery = z.infer<
  typeof GetSkillSuggestionsQuerySchema
>;

export const GetSkillSuggestionsResponseBodySchema = z.object({
  suggestions: z.array(SkillSuggestionSchema),
});
export type GetSkillSuggestionsResponseBody = z.infer<
  typeof GetSkillSuggestionsResponseBodySchema
>;

const PatchSkillSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
});

export type PatchSkillSuggestionRequestBody = z.infer<
  typeof PatchSkillSuggestionRequestBodySchema
>;

export const PatchSkillSuggestionResponseBodySchema = z.object({
  suggestions: z.array(SkillSuggestionSchema),
});
export type PatchSkillSuggestionResponseBody = z.infer<
  typeof PatchSkillSuggestionResponseBodySchema
>;

// Mounted under /api/w/:wId/assistant/skills.

export const skillsApp = new Hono();

// Shared skill fetch + canWrite check for everything under /:sId/*.
skillsApp.use("/:sId/*", async (c, next) => {
  const auth = c.get("auth");
  const sId = c.req.param("sId");

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return c.json(
      {
        error: {
          type: "skill_not_found",
          message: "The skill configuration was not found.",
        },
      },
      404
    );
  }

  if (!skill.canWrite(auth)) {
    return c.json(
      {
        error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the skill or workspace admins can view suggestions.",
        },
      },
      403
    );
  }

  c.set("skill", skill);
  await next();
});

skillsApp.get("/:sId/suggestions", async (c) => {
  const auth = c.get("auth");
  const skill = c.get("skill");

  if (!(await hasReinforcementEnabled(auth))) {
    return c.json({ suggestions: [] });
  }

  // Hono path-param fetch returns single-value query; for `states` we want all
  // repeats too. Build the input object explicitly.
  const queryInput = {
    states: c.req.queries("states"),
    kind: c.req.query("kind"),
    limit: c.req.query("limit"),
  };
  const queryValidation = GetSkillSuggestionsQuerySchema.safeParse(queryInput);
  if (!queryValidation.success) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: `Invalid query parameters: ${queryValidation.error.message}`,
        },
      },
      400
    );
  }

  const { states, kind, limit } = queryValidation.data;

  const parsedLimit = limit ? parseInt(limit, 10) : undefined;
  if (parsedLimit !== undefined && isNaN(parsedLimit)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Invalid limit parameter: must be a number",
        },
      },
      400
    );
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

  return c.json({ suggestions: suggestions.map((s) => s.toJSON()) });
});

skillsApp.patch(
  "/:sId/suggestions",
  validate("json", PatchSkillSuggestionRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const skill = c.get("skill");

    if (!(await hasReinforcementEnabled(auth))) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Self-improving skills are not enabled for this workspace.",
          },
        },
        400
      );
    }

    const { suggestionIds, state } = c.req.valid("json");

    const suggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    if (suggestions.length !== suggestionIds.length) {
      return c.json(
        {
          error: {
            type: "agent_suggestion_not_found",
            message: "One or more skill suggestions were not found.",
          },
        },
        404
      );
    }

    for (const suggestion of suggestions) {
      if (suggestion.skillConfigurationSId !== skill.sId) {
        return c.json(
          {
            error: {
              type: "invalid_request_error",
              message:
                "One or more skill suggestions do not belong to the specified skill configuration.",
            },
          },
          400
        );
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

    return c.json({
      suggestions: updatedSuggestions.map(
        (s): SkillSuggestionType => s.toJSON()
      ),
    });
  }
);
