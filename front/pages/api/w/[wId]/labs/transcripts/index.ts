import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError } from "@app/logger/withlogging";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const acceptableTranscriptProvidersCodec = t.union([
  t.literal("google_drive"),
  t.literal("gong"),
]);

export const PostLabsTranscriptsConfigurationBodySchema = t.type({
  connectionId: t.string,
  provider: acceptableTranscriptProvidersCodec,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetLabsTranscriptsConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
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
      const transcriptsConfiguration =
        await LabsTranscriptsConfigurationResource.findByUserAndWorkspace({
          auth,
          userId: user.id,
        });

      if (!transcriptsConfiguration) {
        return res.status(200).json({
          configuration: null,
        });
      }

      return res.status(200).json({
        configuration: transcriptsConfiguration,
      });

    // Create.
    case "POST":
      const bodyValidation = PostLabsTranscriptsConfigurationBodySchema.decode(
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

      const { connectionId, provider } = bodyValidation.right;

      const transcriptsConfigurationAlreadyExists =
        await LabsTranscriptsConfigurationResource.findByUserAndWorkspace({
          auth,
          userId: user.id,
        });

      if (transcriptsConfigurationAlreadyExists) {
        return apiError(req, res, {
          status_code: 409,
          api_error: {
            type: "transcripts_configuration_already_exists",
            message: "The transcripts configuration already exists.",
          },
        });
      }

      const transcriptsConfigurationPostResource =
        await LabsTranscriptsConfigurationResource.makeNew({
          userId: user.id,
          workspaceId: owner.id,
          provider,
          connectionId,
        });

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationPostResource });

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
