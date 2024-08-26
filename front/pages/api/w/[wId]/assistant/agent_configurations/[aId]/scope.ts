import type { AgentStatus, WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { setAgentUserListStatus } from "@app/lib/api/assistant/user_relation";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

export const PostAgentScopeRequestBodySchema = t.type({
  scope: t.union([
    t.literal("workspace"),
    t.literal("published"),
    t.literal("private"),
  ]),
});

export type PostAgentScopeRequestBody = t.TypeOf<
  typeof PostAgentScopeRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only users of the current workspace can access its assistants.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, req.query.aId as string);
  if (
    !assistant ||
    (assistant.scope === "private" &&
      assistant.versionAuthorId !== auth.user()?.id)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Assistant you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostAgentScopeRequestBodySchema.decode(req.body);
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

      if (assistant.scope === "workspace" && !auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only builders can modify workspace assistants.",
          },
        });
      }

      if (
        assistant.scope !== "private" &&
        bodyValidation.right.scope === "private"
      ) {
        // switching an assistant back to private: the caller must be a user
        if (!auth.user()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "app_auth_error",
              message:
                "An assistant can only be set to private by an existing user of the workspace.",
            },
          });
        }

        // ensure the assistant is in the list of the user otherwise
        // switching it back to private will make it disappear
        const setRes = await setAgentUserListStatus({
          auth,
          agentId: assistant.sId,
          listStatus: "in-list",
        });

        if (setRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: setRes.error.message,
            },
          });
        }
      }

      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: {
          ...assistant,
          scope: bodyValidation.right.scope,
          status: assistant.status as AgentStatus,
          templateId: assistant.templateId,
        },
        agentConfigurationId: assistant.sId,
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "assistant_saving_error",
            message: `Error updating assistant: ${agentConfigurationRes.error.message}`,
          },
        });
      }

      res.status(200).end();
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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
