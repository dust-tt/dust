import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/client";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const PatchLabsTranscriptsConfigurationBodySchema = t.partial({
  agentConfigurationId: t.string,
  isActive: t.boolean,
});
export type PatchTranscriptsConfiguration = t.TypeOf<
  typeof PatchLabsTranscriptsConfigurationBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<GetLabsTranscriptsConfigurationResponseBody>
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const userId = auth.user()?.id;

  if (!owner || !userId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace or user was not found.",
      },
    });
  }

  if (!owner.flags.includes("labs_transcripts")) {
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
    await LabsTranscriptsConfigurationResource.fetchById(
      transcriptsConfigurationId
    );
  // TODO(2024-04-19 flav) Consider adding auth to `fetchById` to move this permission check within the method.
  if (
    !transcriptsConfiguration ||
    transcriptsConfiguration.userId !== userId ||
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

      const { agentConfigurationId: patchAgentId, isActive } =
        patchBodyValidation.right;

      if (patchAgentId) {
        await transcriptsConfiguration.setAgentConfigurationId({
          agentConfigurationId: patchAgentId,
        });
      }

      if (isActive !== undefined) {
        await transcriptsConfiguration.setIsActive(isActive);
        if (isActive) {
          await launchRetrieveTranscriptsWorkflow(transcriptsConfiguration);
        } else {
          // Cancel the workflow
          await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
        }
      }

      return res.status(200).json({ configuration: transcriptsConfiguration });

    case "DELETE":
      if (transcriptsConfiguration.isActive) {
        await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      }
      await transcriptsConfiguration.delete();
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

export default withLogging(handler);
