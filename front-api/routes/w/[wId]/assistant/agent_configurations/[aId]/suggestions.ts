import { Hono } from "hono";
import { z } from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

const PatchSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
});

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

const stringOrArrayToArray = z.preprocess(
  (v) => (typeof v === "string" ? [v] : v),
  z.array(StateSchema)
);

const GetSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray.optional(),
  kind: z.enum(["instructions", "tools", "skills", "model"]).optional(),
  limit: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/suggestions.
const app = new Hono();

app.get("/", validate("query", GetSuggestionsQuerySchema), async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agent) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }
  if (!agent.canEdit && !auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the agent or workspace admins can view suggestions.",
      },
    });
  }

  const { states, kind, limit } = c.req.valid("query");

  const parsedLimit = limit ? parseInt(limit, 10) : undefined;
  if (parsedLimit !== undefined && isNaN(parsedLimit)) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid limit parameter: must be a number",
      },
    });
  }

  const suggestions = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    aId,
    { states, kind, limit: parsedLimit }
  );

  return c.json({ suggestions: suggestions.map((s) => s.toJSON()) });
});

app.patch(
  "/",
  validate("json", PatchSuggestionRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const aId = c.req.param("aId") ?? "";

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!agent) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }
    if (!agent.canEdit && !auth.isAdmin()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the agent or workspace admins can view suggestions.",
        },
      });
    }

    const { suggestionIds, state } = c.req.valid("json");

    const suggestions = await AgentSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    if (suggestions.length !== suggestionIds.length) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_suggestion_not_found",
          message: "One or more agent suggestions were not found.",
        },
      });
    }

    for (const suggestion of suggestions) {
      if (suggestion._agentConfigurationId !== agent.sId) {
        return apiError(c, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "One or more agent suggestions do not belong to the specified agent configuration.",
          },
        });
      }
    }

    await AgentSuggestionResource.bulkUpdateState(auth, suggestions, state);

    const updatedSuggestions = await AgentSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    return c.json({
      suggestions: updatedSuggestions.map((s) => s.toJSON()),
    });
  }
);

export default app;
