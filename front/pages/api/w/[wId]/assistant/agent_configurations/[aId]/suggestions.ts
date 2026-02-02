import assert from "assert";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getModelConfigByModelId } from "@app/lib/api/models";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type {
  AgentSuggestionType,
  AgentSuggestionWithRelationsType,
  SkillSuggestionRelations,
  ToolSuggestionRelations,
} from "@app/types/suggestions/agent_suggestion";

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
  withRelations: z.enum(["true"]).optional(),
});

export type GetSuggestionsQuery = z.infer<typeof GetSuggestionsQuerySchema>;

export interface GetSuggestionsResponseBody {
  suggestions: AgentSuggestionType[];
}

export interface GetSuggestionsWithRelationsResponseBody {
  suggestions: AgentSuggestionWithRelationsType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | PatchSuggestionResponseBody
      | GetSuggestionsResponseBody
      | GetSuggestionsWithRelationsResponseBody
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

      const { states, kind, limit, withRelations } = queryValidation.data;

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

      if (withRelations === "true") {
        const suggestionsWithRelations = await concurrentExecutor(
          suggestions,
          async (suggestion): Promise<AgentSuggestionWithRelationsType> => {
            const baseJson = suggestion.toJSON();

            switch (baseJson.kind) {
              case "tools": {
                const { additions, deletions } =
                  await suggestion.listRelatedMcpServerViews(auth);
                const toolsRelations: ToolSuggestionRelations = {
                  additions: additions.map((view) => view.toJSON()),
                  deletions: deletions.map((view) => view.toJSON()),
                };
                return { ...baseJson, relations: toolsRelations };
              }

              case "skills": {
                const { additions, deletions } =
                  await suggestion.listRelatedSkills(auth);
                const skillsRelations: SkillSuggestionRelations = {
                  additions: additions.map((skill) => skill.toJSON(auth)),
                  deletions: deletions.map((skill) => skill.toJSON(auth)),
                };
                return { ...baseJson, relations: skillsRelations };
              }

              case "model": {
                const model = getModelConfigByModelId(
                  baseJson.suggestion.modelId
                );
                assert(model, "Model not found");
                return { ...baseJson, relations: { model } };
              }

              case "instructions":
                return { ...baseJson, relations: null };
            }
          },
          { concurrency: 10 }
        );
        return res.status(200).json({ suggestions: suggestionsWithRelations });
      }

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
