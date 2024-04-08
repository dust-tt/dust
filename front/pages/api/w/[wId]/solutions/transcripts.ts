import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { SolutionsTranscriptsConfigurationResource } from "@app/lib/resources/solutions_transcripts_configuration_resource";
import type { SolutionsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/solutions";
import type { SolutionProviderType } from "@app/lib/solutions/transcripts/utils/types";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetSolutionsConfigurationResponseBody = {
  configuration: SolutionsTranscriptsConfigurationModel | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<GetSolutionsConfigurationResponseBody>
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

  switch (req.method) {
    case "GET":
      const transcriptsConfigurationGetRes =
        await SolutionsTranscriptsConfigurationResource.findByUserIdAndProvider(
          {
            attributes: [
              "id",
              "connectionId",
              "provider",
              "agentConfigurationId",
            ],
            where: {
              userId: owner.id,
              provider: req.query.provider as SolutionProviderType,
            },
          }
        );

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationGetRes });

    // Update
    case "PATCH":
      const {
        agentConfigurationId: patchAgentId,
        provider: patchProvider,
        email: emailToNotify,
      } = req.body;
      if (!patchAgentId || !patchProvider) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The `connectionId` and `provider` parameters are required.",
          },
        });
      }

      const transcriptsConfigurationPatchRes =
        await SolutionsTranscriptsConfigurationResource.findByUserIdAndProvider(
          {
            attributes: ["id", "connectionId", "provider"],
            where: {
              userId: owner.id,
              provider: patchProvider as SolutionProviderType,
            },
          }
        );

      if (!transcriptsConfigurationPatchRes) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "not_found",
            message: "The configuration was not found.",
          },
        });
      }

      await SolutionsTranscriptsConfigurationResource.setAgentConfigurationId({
        agentConfigurationId: patchAgentId,
        provider: patchProvider,
        userId: owner.id,
      });

      if (emailToNotify) {
        await SolutionsTranscriptsConfigurationResource.setEmailToNotify({
          emailToNotify,
          provider: patchProvider,
          userId: owner.id,
        });
      }

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationPatchRes });

    // Create
    case "POST":
      const { connectionId, provider } = req.body;
      if (!connectionId || !provider) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The `connectionId` and `provider` parameters are required.",
          },
        });
      }

      const transcriptsConfigurationPostRes =
        await SolutionsTranscriptsConfigurationResource.makeNew({
          userId: owner.id,
          connectionId,
          provider,
        });

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationPostRes });

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
