import assert from "assert";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { isPlatformMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { AgentStatus, WithAPIErrorResponse } from "@app/types";

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
  const assistant = await getAgentConfiguration(
    auth,
    req.query.aId as string,
    "full"
  );
  if (
    !assistant ||
    (assistant.scope === "private" &&
      assistant.versionAuthorId !== auth.user()?.id)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
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
            message: "Only builders can modify workspace agents.",
          },
        });
      }

      if (
        assistant.scope !== "private" &&
        bodyValidation.right.scope === "private"
      ) {
        // switching an agent back to private: the caller must be a user
        if (!auth.user()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "app_auth_error",
              message:
                "An agent can only be set to private by an existing user of the workspace.",
            },
          });
        }
      }

      // Cast the assistant to ensure TypeScript understands the correct types
      const typedAssistant = {
        ...assistant,
        scope: bodyValidation.right.scope,
        status: assistant.status as AgentStatus,
        templateId: assistant.templateId,
        // Ensure actions are correctly typed.
        actions: assistant.actions.map((action) => {
          assert(
            isPlatformMCPServerConfiguration(action),
            "MCP actions must be platform MCP actions."
          );

          return action;
        }),
      };

      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: typedAssistant,
        agentConfigurationId: assistant.sId,
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "assistant_saving_error",
            message: `Error updating agent: ${agentConfigurationRes.error.message}`,
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

export default withSessionAuthenticationForWorkspace(handler);
