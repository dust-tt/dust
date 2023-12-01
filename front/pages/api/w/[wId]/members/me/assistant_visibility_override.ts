import {
  AgentConfigurationType,
  AgentVisibilityOverrideType,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  deleteVisibilityOverrideForUser,
  getVisibilityOverridesForUser,
  setVisibilityOverrideForUser,
} from "@app/lib/api/assistant/visibility_override";
import { Authenticator, getSession } from "@app/lib/auth";
import { Membership } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
export type PostVisibilityOverrideResponseBody = {
  created: boolean | null;
  visibility: AgentVisibilityOverrideType;
};

export type GetVisibilityOverrideResponseBody = {
  visibilityOverrides: {
    assistantId: string;
    visibilityOverride: AgentVisibilityOverrideType;
  }[];
};

export const PostVisibilityOverrideRequestBodySchema = t.type({
  assistantId: t.string,
  visibility: t.union([
    t.literal("workspace-unlisted"),
    t.literal("published-listed"),
  ]),
});

export const DeleteVisibilityOverrideBodySchema = t.type({
  assistantId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | PostVisibilityOverrideResponseBody
    | GetVisibilityOverrideResponseBody
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
  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  const membership = await Membership.findOne({
    where: { userId, workspaceId },
  });
  if (!membership) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "membership_not_found",
        message: "The membership requested was not found.",
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
      const visibilityOverrides = await getVisibilityOverridesForUser(auth);
      if (visibilityOverrides.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: visibilityOverrides.error.message,
          },
        });
      }

      res.status(200).json({ visibilityOverrides: visibilityOverrides.value });
      return;
    case "POST":
      const bodyValidation = PostVisibilityOverrideRequestBodySchema.decode(
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

      const { assistantId, visibility } = bodyValidation.right;
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
      const result = await setVisibilityOverrideForUser({
        auth,
        agentId: assistantId,
        visibility,
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
      const bodyValidationDelete = DeleteVisibilityOverrideBodySchema.decode(
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
      const delMembership = await Membership.findOne({
        where: { userId: auth.user()?.id, workspaceId: auth.workspace()?.id },
      });
      if (!delMembership) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "membership_not_found",
            message: "The membership requested was not found.",
          },
        });
      }

      const deleteResult = await deleteVisibilityOverrideForUser({
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
