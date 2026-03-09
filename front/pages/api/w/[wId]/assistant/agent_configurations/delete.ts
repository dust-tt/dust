import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type PostAgentConfigurationArchiveResponseBody = {
  archived: number;
};

export const PostAgentConfigurationArchive = t.type({
  agentConfigurationIds: t.array(t.string),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostAgentConfigurationArchiveResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      const bodyValidation = PostAgentConfigurationArchive.decode(req.body);
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

      const { agentConfigurationIds } = bodyValidation.right;

      const agentConfigurations = await getAgentConfigurations(auth, {
        agentIds: agentConfigurationIds,
        variant: "extra_light",
      });
      const toDelete = agentConfigurations.filter((a) => a.status === "active");
      if (toDelete.length !== agentConfigurationIds.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "One or more agent configurations were not found.",
          },
        });
      }
      if (toDelete.some((agent) => !agent.canEdit && !auth.isAdmin())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete workspace agent.",
          },
        });
      }

      for (const agentConfiguration of toDelete) {
        await archiveAgentConfiguration(auth, agentConfiguration.sId);
      }

      return res.status(200).json({
        archived: agentConfigurations.length,
      });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
