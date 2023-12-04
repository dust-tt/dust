import {
  AgentConfigurationType,
  AgentRelationOverrideType,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  deleteAgentRelationOverrideForUser,
  getAgentRelationOverridesForUser,
  setAgentRelationOverrideForUser,
} from "@app/lib/api/assistant/relation_override";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostAgentRelationOverrideResponseBody = {
  created: boolean | null;
  agentRelationOverride: AgentRelationOverrideType;
};

export type GetAgentRelationOverrideResponseBody = {
  agentRelationOverrides: {
    assistantId: string;
    agentRelationOverride: AgentRelationOverrideType;
  }[];
};

export const PostAgentRelationOverrideRequestBodySchema = t.type({
  assistantId: t.string,
  agentRelation: t.union([t.literal("in-list"), t.literal("not-in-list")]),
});

export const DeleteAgentRelationOverrideBodySchema = t.type({
  assistantId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | PostAgentRelationOverrideResponseBody
    | GetAgentRelationOverrideResponseBody
    | { success: boolean }
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace are authorized to access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      let singleAgentConfiguration: AgentConfigurationType | null = null;
      if (req.query.assistantId) {
        if (typeof req.query.assistantId !== "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The assistant id must be a string.",
            },
          });
        }
        singleAgentConfiguration = await getAgentConfiguration(
          auth,
          req.query.assistantId as string
        );
        if (!singleAgentConfiguration) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "agent_configuration_not_found",
              message: "The agent requested was not found.",
            },
          });
        }
      }
      const agentRelationOverrides = await getAgentRelationOverridesForUser(
        auth
      );
      if (agentRelationOverrides.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: agentRelationOverrides.error.message,
          },
        });
      }

      res
        .status(200)
        .json({ agentRelationOverrides: agentRelationOverrides.value });
      return;
    case "POST":
      const bodyValidation = PostAgentRelationOverrideRequestBodySchema.decode(
        req.body
      );
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

      const { assistantId, agentRelation } = bodyValidation.right;
      const agentConfiguration = await getAgentConfiguration(auth, assistantId);
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent requested was not found.",
          },
        });
      }
      const result = await setAgentRelationOverrideForUser({
        auth,
        agentId: assistantId,
        relation: agentRelation,
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }
      res.status(200).json(result.value);
      return;
    case "DELETE":
      const bodyValidationDelete = DeleteAgentRelationOverrideBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidationDelete)) {
        const pathError = reporter.formatValidationErrors(
          bodyValidationDelete.left
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const { assistantId: assistantIdToDelete } = bodyValidationDelete.right;
      const deleteAgentConfiguration = await getAgentConfiguration(
        auth,
        assistantIdToDelete
      );
      if (!deleteAgentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent requested was not found.",
          },
        });
      }

      const deleteResult = await deleteAgentRelationOverrideForUser({
        auth,
        agentId: assistantIdToDelete,
      });
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: deleteResult.error.message,
          },
        });
      }
      res.status(200).json(deleteResult.value);
      return;
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

export default withLogging(handler);
