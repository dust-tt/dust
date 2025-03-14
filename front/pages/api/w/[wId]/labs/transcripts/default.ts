import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError } from "@app/logger/withlogging";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import { acceptableTranscriptProvidersCodec } from "@app/pages/api/w/[wId]/labs/transcripts";
import type { WithAPIErrorResponse } from "@app/types";
import { isProviderWithWorkspaceConfiguration } from "@app/types";

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
          isDefaultWorkspaceConfiguration: true,
        });

      if (!transcriptsConfiguration) {
        return res.status(200).json({
          configuration: null,
        });
      }

      // Whitelist providers that allow workspace-wide configuration.
      if (!isProviderWithWorkspaceConfiguration(provider)) {
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

export default withSessionAuthenticationForWorkspace(handler);
