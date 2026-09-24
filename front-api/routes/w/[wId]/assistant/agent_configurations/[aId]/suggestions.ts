import { applyAgentSuggestions } from "@app/lib/api/assistant/apply_agent_suggestions";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type {
  GetSuggestionsResponseBody,
  PatchSuggestionResponseBody,
} from "@app/types/api/assistant/agent_suggestion";
import { PatchSuggestionRequestBodySchema } from "@app/types/api/assistant/agent_suggestion";
import { isString } from "@app/types/shared/utils/general";
import { AGENT_SUGGESTION_SOURCES } from "@app/types/suggestions/agent_suggestion";
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
  sources: stringOrArrayToArray(z.enum(AGENT_SUGGESTION_SOURCES)).optional(),
  conversationId: z.string().optional(),
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

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
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
    if (!agent.canEdit) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message: "Only editors of the agent can view suggestions.",
        },
      });
    }

    const { states, kind, sources, conversationId, limit } =
      ctx.req.valid("query");

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

    // Resolved through `ConversationResource` so the filter only ever matches a conversation the
    // caller can access; an unknown or inaccessible one yields no suggestions.
    let conversationModelId: number | undefined;
    if (conversationId) {
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        return ctx.json({ suggestions: [] });
      }
      conversationModelId = conversation.id;
    }

    const suggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(auth, aId, {
        states,
        kind,
        sources,
        conversationModelId,
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

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
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
    if (!agent.canEdit) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message: "Only editors of the agent can view suggestions.",
        },
      });
    }

    const { suggestionIds, state, applyToAgent } = ctx.req.valid("json");

    if (applyToAgent && state !== "approved") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Only an approved suggestion can be applied to the agent.",
        },
      });
    }

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

    if (applyToAgent) {
      const alreadyReviewedIds = suggestions
        .filter((suggestion) => suggestion.state !== "pending")
        .map((suggestion) => suggestion.sId);
      if (alreadyReviewedIds.length > 0) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The following agent suggestions have already been reviewed: ${alreadyReviewedIds.join(", ")}.`,
          },
        });
      }

      const applyRes = await applyAgentSuggestions(auth, {
        agent,
        suggestions,
      });
      if (applyRes.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: applyRes.error.message,
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
