/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { SkillSuggestionSchema } from "@app/types/suggestions/skill_suggestion";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

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

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

// Next.js serializes single query param values as string, multiple as array.
const stringOrArrayToArray = z.preprocess(
  (v) => (typeof v === "string" ? [v] : v),
  z.array(StateSchema)
);

const GetSkillSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray.optional(),
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PatchSkillSuggestionResponseBody | GetSkillSuggestionsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { sId } = req.query;
  if (!isString(sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill configuration ID in path.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill configuration was not found.",
      },
    });
  }

  if (!skill.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the skill or workspace admins can view suggestions.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      if (!(await hasReinforcementEnabled(auth))) {
        return res.status(200).json({ suggestions: [] });
      }

      const queryValidation = GetSkillSuggestionsQuerySchema.safeParse(
        req.query
      );
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
        await SkillSuggestionResource.listBySkillConfigurationId(auth, sId, {
          states,
          sources: ["reinforcement"],
          kind,
          limit: parsedLimit,
        });

      return res
        .status(200)
        .json({ suggestions: suggestions.map((s) => s.toJSON()) });
    }

    case "PATCH": {
      if (!(await hasReinforcementEnabled(auth))) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Reinforcement is not enabled for this workspace.",
          },
        });
      }

      const bodyValidation = PatchSkillSuggestionRequestBodySchema.safeParse(
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

      const suggestions = await SkillSuggestionResource.fetchByIds(
        auth,
        suggestionIds
      );

      if (suggestions.length !== suggestionIds.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_suggestion_not_found",
            message: "One or more skill suggestions were not found.",
          },
        });
      }

      for (const suggestion of suggestions) {
        if (suggestion.skillConfigurationSId !== skill.sId) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "One or more skill suggestions do not belong to the specified skill configuration.",
            },
          });
        }
      }

      await SkillSuggestionResource.bulkUpdateState(auth, suggestions, state);

      // Bulk update doesn't mutate the resources, so we need to refetch here.
      const updatedSuggestions = await SkillSuggestionResource.fetchByIds(
        auth,
        suggestionIds
      );

      return res.status(200).json({
        suggestions: updatedSuggestions.map(
          (s): SkillSuggestionType => s.toJSON()
        ),
      });
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
