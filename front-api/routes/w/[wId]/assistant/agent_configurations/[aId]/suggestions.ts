import {
  checkSkillAddition,
  fetchSuggestableSkills,
} from "@app/lib/api/assistant/suggestable_skills";
import {
  checkSubAgentAddition,
  fetchSuggestableSubAgents,
} from "@app/lib/api/assistant/suggestable_sub_agents";
import {
  checkToolAddition,
  fetchSuggestableTools,
} from "@app/lib/api/assistant/suggestable_tools";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type {
  GetSuggestionsResponseBody,
  PatchSuggestionResponseBody,
} from "@app/types/api/assistant/agent_suggestion";
import { PatchSuggestionRequestBodySchema } from "@app/types/api/assistant/agent_suggestion";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
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

/**
 * Accepting a Sidekick suggestion lets the builder apply it as recorded, so a tool, skill or
 * sub-agent it adds is checked again against live state: it may have stopped qualifying (archived,
 * restricted to skills, access lost) since the suggestion was recorded.
 */
async function checkSuggestedAdditions(
  auth: Authenticator,
  agent: AgentResource,
  suggestions: AgentSuggestionResource[]
): Promise<Result<undefined, string>> {
  const toolIds: string[] = [];
  const skillIds: string[] = [];
  const subAgentIds: string[] = [];
  for (const { kind, suggestion } of suggestions.map((s) => s.toJSON())) {
    if (kind === "tools" && suggestion.action === "add") {
      toolIds.push(suggestion.toolId);
    } else if (kind === "skills" && suggestion.action === "add") {
      skillIds.push(suggestion.skillId);
    } else if (kind === "sub_agent" && suggestion.action === "add") {
      subAgentIds.push(suggestion.childAgentId);
    }
  }

  const [suggestableTools, suggestableSkills, suggestableSubAgents] =
    await Promise.all([
      fetchSuggestableTools(auth, toolIds),
      fetchSuggestableSkills(auth, skillIds),
      fetchSuggestableSubAgents(auth, subAgentIds),
    ]);
  const additions = [
    ...toolIds.map((id) => checkToolAddition(id, suggestableTools)),
    ...skillIds.map((id) => checkSkillAddition(id, suggestableSkills)),
    ...subAgentIds.map((id) =>
      checkSubAgentAddition(id, suggestableSubAgents, { agentId: agent.sId })
    ),
  ];
  for (const addition of additions) {
    if (addition.isErr()) {
      return new Err(addition.error);
    }
  }
  return new Ok(undefined);
}

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

    return ctx.json({ suggestions: suggestions.map((s) => s.toJSON()) });
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

    if (state === "approved") {
      const check = await checkSuggestedAdditions(auth, agent, suggestions);
      if (check.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: check.error,
          },
        });
      }
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
