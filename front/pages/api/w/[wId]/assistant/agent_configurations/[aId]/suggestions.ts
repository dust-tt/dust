import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PatchSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
});

export type PatchSuggestionRequestBody = z.infer<
  typeof PatchSuggestionRequestBodySchema
>;

export interface PatchSuggestionResponseBody {
  suggestions: AgentSuggestionType[];
}

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

// Next.js serializes single query param values as string, multiple as array.
const stringOrArrayToArray = z.preprocess(
  (v) => (typeof v === "string" ? [v] : v),
  z.array(StateSchema)
);

const GetSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray.optional(),
  kind: z.enum(["instructions", "tools", "skills", "model"]).optional(),
  limit: z.string().optional(),
});

export type GetSuggestionsQuery = z.infer<typeof GetSuggestionsQuerySchema>;

export interface GetSuggestionsResponseBody {
  suggestions: AgentSuggestionType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PatchSuggestionResponseBody | GetSuggestionsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("agent_builder_copilot")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Agent builder copilot is not enabled for this workspace.",
      },
    });
  }
  if (!isString(req.query.aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID in path.",
      },
    });
  }

  const agentConfigurationId = req.query.aId;

  const agent = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });
  if (!agent) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }
  if (!agent.canEdit) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the agent or workspace admins can view suggestions.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const queryValidation = GetSuggestionsQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid limit parameter: must be a number",
          },
        });
      }

      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          auth,
          agentConfigurationId,
          {
            states,
            kind,
            limit: parsedLimit,
          }
        );

      return res
        .status(200)
        .json({ suggestions: suggestions.map((s) => s.toJSON()) });
    }

    case "PATCH": {
      const bodyValidation = PatchSuggestionRequestBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyValidation.error.message}`,
          },
        });
      }

      const { suggestionIds, state } = bodyValidation.data;

      const suggestions = await AgentSuggestionResource.fetchByIds(
        auth,
        suggestionIds
      );

      if (suggestions.length !== suggestionIds.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_suggestion_not_found",
            message: "One or more agent suggestions were not found.",
          },
        });
      }

      for (const suggestion of suggestions) {
        if (suggestion.agentConfigurationSId !== agent.sId) {
          return apiError(req, res, {
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

      // Bulk update doesn't mutate the resources, so we need to refetch here.
      const updatedSuggestions = await AgentSuggestionResource.fetchByIds(
        auth,
        suggestionIds
      );

      return res
        .status(200)
        .json({ suggestions: updatedSuggestions.map((s) => s.toJSON()) });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
