import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

const PatchSuggestionRequestBodySchema = t.type({
  suggestionId: t.string,
  state: t.union([
    t.literal("approved"),
    t.literal("rejected"),
    t.literal("outdated"),
  ]),
});

export type PatchSuggestionRequestBody = t.TypeOf<
  typeof PatchSuggestionRequestBodySchema
>;

export interface PatchSuggestionResponseBody {
  suggestion: AgentSuggestionType;
}

const GetSuggestionsQuerySchema = t.partial({
  states: t.array(
    t.union([
      t.literal("pending"),
      t.literal("approved"),
      t.literal("rejected"),
      t.literal("outdated"),
    ])
  ),
  kind: t.union([
    t.literal("instructions"),
    t.literal("tools"),
    t.literal("skills"),
    t.literal("model"),
  ]),
  limit: t.string,
});

export type GetSuggestionsQuery = t.TypeOf<typeof GetSuggestionsQuerySchema>;

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
      const queryValidation = GetSuggestionsQuerySchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { states, kind, limit } = queryValidation.right;

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
      const bodyValidation = PatchSuggestionRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { suggestionId, state } = bodyValidation.right;

      const suggestion = await AgentSuggestionResource.fetchById(
        auth,
        suggestionId
      );
      if (!suggestion) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_suggestion_not_found",
            message: "The agent suggestion was not found.",
          },
        });
      }
      if (suggestion.agentConfigurationId !== agent.id) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The agent suggestion does not belong to the specified agent configuration.",
          },
        });
      }

      await suggestion.updateState(auth, state);

      return res.status(200).json({ suggestion: suggestion.toJSON() });
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
