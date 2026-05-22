// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { LabsTranscriptsConfigurationType } from "@app/types/labs";
import {
  isCredentialProvider,
  isProviderWithDefaultWorkspaceConfiguration,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationType | null;
};

// Define provider type separately for better reuse
export const acceptableTranscriptProvidersCodec = z.enum([
  "google_drive",
  "modjo",
]);

export const acceptableTranscriptsWithConnectorProvidersCodec =
  z.literal("gong");

const OAuthConfigSchema = z.object({
  provider: acceptableTranscriptProvidersCodec,
  connectionId: z.string(),
});

const ApiKeyConfigSchema = z.object({
  provider: acceptableTranscriptProvidersCodec,
  apiKey: z.string(),
});

const ConnectorConnectionConfigSchema = z.object({
  provider: acceptableTranscriptsWithConnectorProvidersCodec,
  useConnectorConnection: z.boolean(),
});

export const PostLabsTranscriptsConfigurationBodySchema = z.union([
  OAuthConfigSchema,
  ApiKeyConfigSchema,
  ConnectorConnectionConfigSchema,
]);

export function isApiKeyConfig(
  config: z.infer<typeof PostLabsTranscriptsConfigurationBodySchema>
): config is z.infer<typeof ApiKeyConfigSchema> {
  return "apiKey" in config;
}

export function isConnectorConnectionConfig(
  config: z.infer<typeof PostLabsTranscriptsConfigurationBodySchema>
): config is z.infer<typeof ConnectorConnectionConfigSchema> {
  return "useConnectorConnection" in config;
}

function getConnectionDetails(
  validatedBody: z.infer<typeof PostLabsTranscriptsConfigurationBodySchema>
) {
  if (isConnectorConnectionConfig(validatedBody)) {
    return { oAuthConnectionId: null, useConnectorConnection: true };
  }
  if (isApiKeyConfig(validatedBody)) {
    return {
      oAuthConnectionId: null,
      useConnectorConnection: false,
      apiKey: validatedBody.apiKey,
    };
  }
  return {
    oAuthConnectionId: validatedBody.connectionId,
    useConnectorConnection: false,
  };
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
  const flags = await getFeatureFlags(auth);
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
      const transcriptsConfigurationRes =
        await LabsTranscriptsConfigurationResource.findByUserAndWorkspace({
          auth,
          userId: user.id,
        });
      const transcriptsConfiguration = transcriptsConfigurationRes?.toJSON();

      if (!transcriptsConfiguration) {
        return res.status(200).json({
          configuration: null,
        });
      }

      return res.status(200).json({
        configuration: transcriptsConfiguration ?? null,
      });

    // Create.
    case "POST":
      const bodyValidation =
        PostLabsTranscriptsConfigurationBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const validatedBody = bodyValidation.data;
      const { provider } = validatedBody;

      const { oAuthConnectionId, useConnectorConnection, apiKey } =
        getConnectionDetails(validatedBody);
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
                message: "Failed to post API key credentials",
              },
            });
          }

          credentialId = oAuthRes.value.credential.credential_id;
        }
      }

      let isDefaultWorkspaceConfiguration = false;

      if (isProviderWithDefaultWorkspaceConfiguration(provider)) {
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
          connectionId: oAuthConnectionId ?? null,
          credentialId: credentialId ?? null,
          isDefaultWorkspaceConfiguration,
          useConnectorConnection,
        });

      const transcriptsConfigurationPost =
        transcriptsConfigurationPostResource.toJSON() ?? null;

      return res
        .status(200)
        .json({ configuration: transcriptsConfigurationPost });

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
