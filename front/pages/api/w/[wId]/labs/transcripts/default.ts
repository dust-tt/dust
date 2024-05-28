import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";

const PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS = ["gong"];

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

  switch (req.method) {
    case "GET":
      const transcriptsConfiguration =
        await LabsTranscriptsConfigurationResource.findByWorkspace({
          auth,
        });

      if (!transcriptsConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "transcripts_configuration_not_found",
            message: "The transcripts configuration was not found.",
          },
        });
      }

      // Whitelist providers that allow workspace-wide configuration.
      if (
        !PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS.includes(
          transcriptsConfiguration.provider
        )
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "transcripts_configuration_default_not_allowed",
            message: "The provider does not allow default configurations.",
          },
        });
      }

      return res.status(200).json({
        configuration: transcriptsConfiguration,
      });
  }
}

export default withLogging(handler);
