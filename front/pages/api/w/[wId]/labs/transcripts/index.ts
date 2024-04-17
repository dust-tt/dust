import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import type { LabsTranscriptsProviderType } from "@app/lib/labs/transcripts/utils/types";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchRetrieveTranscriptsWorkflow } from "@app/temporal/labs/client";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const acceptableProviders = t.union([
  t.literal("google_drive"),
  t.literal("gong"),
]);

export const PostLabsTranscriptsConfigurationBodySchema = t.type({
  connectionId: t.string,
  provider: acceptableProviders,
});

export const PatchLabsTranscriptsConfigurationBodySchema = t.type({
  agentConfigurationId: t.string,
  provider: acceptableProviders,
  email: t.string,
  isActive: t.boolean,
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
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
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
      const transcriptsConfigurationGet =
        await LabsTranscriptsConfigurationResource.findByUserIdAndProvider({
          userId: owner.id,
          provider: req.query.provider as LabsTranscriptsProviderType,
        });

      if (!transcriptsConfigurationGet) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "configuration_not_found",
            message: "The configuration was not found.",
          },
        });
      }

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationGet });

    // Update
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

      const {
        agentConfigurationId: patchAgentId,
        provider: patchProvider,
        email: emailToNotify,
        isActive,
      } = patchBodyValidation.right;

      const transcriptsConfigurationPatchResource =
        await LabsTranscriptsConfigurationResource.findByUserIdAndProvider({
          userId: owner.id,
          provider: patchProvider as LabsTranscriptsProviderType,
        });

      if (!transcriptsConfigurationPatchResource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "configuration_not_found",
            message: "The configuration was not found.",
          },
        });
      }

      await transcriptsConfigurationPatchResource.setAgentConfigurationId({
        agentConfigurationId: patchAgentId,
      });

      if (emailToNotify) {
        await transcriptsConfigurationPatchResource.setEmailToNotify({
          emailToNotify,
        });
      }

      if (isActive !== undefined) {
        await transcriptsConfigurationPatchResource.setIsActive({ isActive });
        if (isActive) {
          await launchRetrieveTranscriptsWorkflow({
            userId: owner.id,
            providerId: patchProvider,
          });
        }
      }

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationPatchResource });

    // Create
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
          userId: owner.id,
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
