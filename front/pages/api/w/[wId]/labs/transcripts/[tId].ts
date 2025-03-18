import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/client";
import type { WithAPIErrorResponse } from "@app/types";
import { isProviderWithDefaultWorkspaceConfiguration } from "@app/types";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const PatchLabsTranscriptsConfigurationBodySchema = t.partial({
  agentConfigurationId: t.string,
  isActive: t.boolean,
  dataSourceViewId: t.union([t.number, t.null]),
});
export type PatchTranscriptsConfiguration = t.TypeOf<
  typeof PatchLabsTranscriptsConfigurationBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetLabsTranscriptsConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);

  if (!flags.includes("labs_transcripts")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "The feature is not enabled for this workspace.",
      },
    });
  }

  const transcriptsConfigurationId = req.query.tId;
  if (typeof transcriptsConfigurationId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The configuration was not found.",
      },
    });
  }

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchByModelId(
      transcriptsConfigurationId
    );
  // TODO(2024-04-19 flav) Consider adding auth to `fetchById` to move this permission check within the method.
  if (
    !transcriptsConfiguration ||
    transcriptsConfiguration.userId !== user.id ||
    transcriptsConfiguration.workspaceId !== owner.id
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "transcripts_configuration_not_found",
        message: "The transcript configuration was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json({ configuration: transcriptsConfiguration });

    // Update.
    case "PATCH":
      const patchBodyValidation =
        PatchLabsTranscriptsConfigurationBodySchema.decode(req.body);

      if (isLeft(patchBodyValidation)) {
        const pathError = reporter.formatValidationErrors(
          patchBodyValidation.left
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration, false);

      const {
        agentConfigurationId: patchAgentId,
        isActive,
        dataSourceViewId,
      } = patchBodyValidation.right;

      if (patchAgentId) {
        await transcriptsConfiguration.setAgentConfigurationId({
          agentConfigurationId: patchAgentId,
        });
      }

      if (isActive !== undefined) {
        logger.info(
          {
            configurationId: transcriptsConfiguration.id,
            isActive,
          },
          "Setting transcript configuration active status."
        );
        await transcriptsConfiguration.setIsActive(isActive);
      }

      if (dataSourceViewId !== undefined) {
        await transcriptsConfiguration.setDataSourceViewId(dataSourceViewId);

        if (
          isProviderWithDefaultWorkspaceConfiguration(
            transcriptsConfiguration.provider
          )
        ) {
          const defaultFullStorageConfiguration =
            await LabsTranscriptsConfigurationResource.fetchDefaultConfigurationForWorkspace(
              auth.getNonNullableWorkspace()
            );
          if (defaultFullStorageConfiguration === null) {
            await transcriptsConfiguration.setIsDefault(!!dataSourceViewId);
          }
        }
      }

      const updatedTranscriptsConfiguration =
        await LabsTranscriptsConfigurationResource.fetchByModelId(
          transcriptsConfiguration.id
        );

      if (!updatedTranscriptsConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "transcripts_configuration_not_found",
            message: "The transcript configuration was not found.",
          },
        });
      }

      const shouldStartWorkflow =
        !!updatedTranscriptsConfiguration.isActive ||
        !!updatedTranscriptsConfiguration.dataSourceViewId;

      if (shouldStartWorkflow) {
        logger.info(
          {
            configurationId: updatedTranscriptsConfiguration.id,
          },
          "Starting transcript retrieval workflow."
        );
        await launchRetrieveTranscriptsWorkflow(
          updatedTranscriptsConfiguration
        );
      }
      return res
        .status(200)
        .json({ configuration: updatedTranscriptsConfiguration });

    case "DELETE":
      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      await transcriptsConfiguration.delete(auth);
      return res.status(200).json({ configuration: null });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
