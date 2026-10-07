import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  GetSuggestionsResponseBody,
  PatchSuggestionResponseBody,
} from "@app/types/api/assistant/agent_suggestion";
import { PatchSuggestionRequestBodySchema } from "@app/types/api/assistant/agent_suggestion";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

const stringOrArrayToArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (isString(v) ? [v] : v), z.array(schema));

const GetSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray(StateSchema).optional(),
  kind: z.enum(["instructions", "tools", "skills", "model"]).optional(),
  limit: z.string().optional(),
});

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/suggestions.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", GetSuggestionsQuerySchema),
  async (ctx): HandlerResult<GetSuggestionsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }
    // Suggestions carry instruction replacements, so admins get no bypass: they must be editors.
    if (!auth.can("write", agent)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message: "Only editors of the agent can view suggestions.",
        },
      });
    }

    const { states, kind, limit } = ctx.req.valid("query");

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

    const suggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(auth, aId, {
        states,
        kind,
        sources: ["sidekick"],
        limit: parsedLimit,
      });

    const skills = await SkillResource.fetchByIds(
      auth,
      removeNulls(
        suggestions.map((suggestion) => suggestion.referencedSkillId)
      ),
      {
        onlyActive: true,
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      }
    );
    const skillsById = new Map(skills.map((skill) => [skill.sId, skill]));

    return ctx.json({
      suggestions: suggestions.map((suggestion) => ({
        ...suggestion.toJSON(),
        skill: skillsById.get(suggestion.referencedSkillId ?? "")?.toJSON(auth),
      })),
    });
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchSuggestionRequestBodySchema),
  async (ctx): HandlerResult<PatchSuggestionResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }
    // Suggestions carry instruction replacements, so admins get no bypass: they must be editors.
    if (!auth.can("write", agent)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message: "Only editors of the agent can view suggestions.",
        },
      });
    }

    const { suggestionIds, state } = ctx.req.valid("json");

    const suggestions = await AgentSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    if (suggestions.length !== suggestionIds.length) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_suggestion_not_found",
          message: "One or more agent suggestions were not found.",
        },
      });
    }

    for (const suggestion of suggestions) {
      if (suggestion._agentConfigurationId !== agent.sId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "One or more agent suggestions do not belong to the specified agent configuration.",
          },
        });
      }
    }

    const nonSidekickSuggestionIds = suggestions
      .filter((suggestion) => suggestion.source !== "sidekick")
      .map((suggestion) => suggestion.sId);
    if (nonSidekickSuggestionIds.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Only Sidekick suggestions can be reviewed here: ${nonSidekickSuggestionIds.join(", ")}.`,
        },
      });
    }

    await AgentSuggestionResource.bulkUpdateState(auth, suggestions, state);

    const updatedSuggestions = await AgentSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    return ctx.json({
      suggestions: updatedSuggestions.map((s) => s.toJSON()),
    });
  }
);

export default app;
