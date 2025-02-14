import type { WithAPIErrorResponse } from "@dust-tt/types";
import {
  isCredentialProvider,
  isProviderWithWorkspaceConfiguration,
  OAuthAPI,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

// Define provider type separately for better reuse
export const acceptableTranscriptProvidersCodec = t.union([
  t.literal("google_drive"),
  t.literal("gong"),
  t.literal("modjo"),
]);

const BaseConfigurationSchema = t.type({
  provider: acceptableTranscriptProvidersCodec,
});

const ConnectionConfigSchema = t.intersection([
  BaseConfigurationSchema,
  t.type({ connectionId: t.string }),
]);

const ApiKeyConfigSchema = t.intersection([
  BaseConfigurationSchema,
  t.type({
    apiKey: t.string,
  }),
]);

export const PostLabsTranscriptsConfigurationBodySchema = t.union([
  ConnectionConfigSchema,
  ApiKeyConfigSchema,
]);

export function isApiKeyConfig(
  config: t.TypeOf<typeof PostLabsTranscriptsConfigurationBodySchema>
): config is t.TypeOf<typeof ApiKeyConfigSchema> {
  return "apiKey" in config;
}

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
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

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

      const validatedBody = bodyValidation.right;
      const { provider } = validatedBody;

      const connectionId = isApiKeyConfig(validatedBody)
        ? undefined
        : validatedBody.connectionId;
      const apiKey = isApiKeyConfig(validatedBody)
        ? validatedBody.apiKey
        : undefined;
      let credentialId: string | undefined;

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

      if (isApiKeyConfig(validatedBody)) {
        if (!apiKey) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "API key is required",
            },
          });
        }

        if (isCredentialProvider(provider)) {
          const oAuthRes = await oauthApi.postCredentials({
            provider,
            userId: user.sId,
            workspaceId: owner.sId,
            credentials: {
              api_key: apiKey,
            },
          });

          if (oAuthRes.isErr()) {
            return res.status(500).json({
              error: {
                type: "invalid_request_error",
                message: "[Modjo] Failed to post credentials",
              },
            });
          }

          credentialId = oAuthRes.value.credential.credential_id;
        }
      }

      let isDefaultWorkspaceConfiguration = false;

      if (isProviderWithWorkspaceConfiguration(provider)) {
        const currentDefaultConfiguration =
          await LabsTranscriptsConfigurationResource.findByWorkspaceAndProvider(
            {
              auth,
              provider,
              isDefaultWorkspaceConfiguration: true,
            }
          );

        isDefaultWorkspaceConfiguration =
          currentDefaultConfiguration === null ||
          currentDefaultConfiguration === undefined;
      }

      const transcriptsConfigurationPostResource =
        await LabsTranscriptsConfigurationResource.makeNew({
          userId: user.id,
          workspaceId: owner.id,
          provider,
          connectionId: connectionId ?? null,
          credentialId: credentialId ?? null,
          isDefaultWorkspaceConfiguration,
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
