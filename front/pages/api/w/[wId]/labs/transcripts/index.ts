import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const acceptableTranscriptProvidersCodec = t.literal("google_drive");

export const PostLabsTranscriptsConfigurationBodySchema = t.type({
  connectionId: t.string,
  provider: acceptableTranscriptProvidersCodec,
});

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
    // List.
    // TODO: This should be a proper list operation.
    case "GET":
      const transcriptsConfigurationGet =
        await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider(
          {
            userId,
            workspaceId: owner.id,
            provider: req.query.provider as LabsTranscriptsProviderType,
          }
        );

      if (!transcriptsConfigurationGet) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The configuration was not found.",
          },
        });
      }

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationGet });

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

      const transcriptsConfigurationPostResource =
        await LabsTranscriptsConfigurationResource.makeNew({
          userId,
          workspaceId: owner.id,
          connectionId,
          provider,
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

export default withLogging(handler);
