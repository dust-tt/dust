import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isBuilder, isString } from "@app/types";

export type AcceptSuggestionResponseBody = {
  success: true;
};

// Request body schema for POST - accepts an array of agent sIds to keep
const AcceptSuggestionRequestBodySchema = t.type({
  agentSIds: t.array(t.string),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AcceptSuggestionResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  }

  if (!isBuilder(owner)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  }

  if (!isString(req.query.sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const sId = req.query.sId;
  const skillResource = await SkillResource.fetchById(auth, sId);

  if (!skillResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      // Check write permission.
      if (!skillResource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can accept this skill suggestion.",
          },
        });
      }

      // Validate that the skill is in 'suggested' status.
      if (skillResource.status !== "suggested") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Only suggested skills can be accepted.",
          },
        });
      }

      // Validate request body.
      const bodyValidation = AcceptSuggestionRequestBodySchema.decode(req.body);
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

      const { agentSIds } = bodyValidation.right;

      // Convert agent sIds to model IDs.
      let agentConfigurationIdsToKeep: number[] = [];
      if (agentSIds.length > 0) {
        const agentConfigurations = await AgentConfigurationModel.findAll({
          where: {
            sId: agentSIds,
            workspaceId: owner.id,
            status: "active",
          },
          attributes: ["id"],
        });
        agentConfigurationIdsToKeep = agentConfigurations.map(
          (agent) => agent.id
        );
      }

      // Accept the suggestion within a transaction.
      const result = await withTransaction(async (transaction) => {
        return skillResource.acceptSuggestion(auth, {
          agentConfigurationIdsToKeep,
          transaction,
        });
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error accepting skill suggestion: ${result.error.message}`,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
