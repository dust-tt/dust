import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError } from "@app/logger/withlogging";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import { acceptableTranscriptProvidersCodec } from "@app/pages/api/w/[wId]/labs/transcripts";

const PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS = ["gong"];

export const GetDefaultTranscriptsConfigurationBodySchema = t.type({
  provider: acceptableTranscriptProvidersCodec,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetLabsTranscriptsConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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
      const bodyValidation =
        GetDefaultTranscriptsConfigurationBodySchema.decode(req.query);

      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request.",
          },
        });
      }

      const { provider } = bodyValidation.right;

      const transcriptsConfiguration =
        await LabsTranscriptsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider,
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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
