import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isCredentialProvider, OAuthAPI, SyncStatus } from "@app/types";

export type GetLabsConnectionsConfigurationResponseBody = {
  configuration: {
    id: string;
    credentialId: string | null;
    dataSourceViewId: number | null;
  } | null;
};

// Define provider type separately for better reuse
export const acceptableConnectionProvidersCodec = t.union([
  t.literal("hubspot"),
  t.literal("hubspot"), // Duplicate to satisfy union type requirement
]);

// Simplify the schema definitions to avoid duplications
const OAuthConfigSchema = t.type({
  provider: acceptableConnectionProvidersCodec,
  connectionId: t.string,
});

const ApiKeyConfigSchema = t.type({
  provider: acceptableConnectionProvidersCodec,
  apiKey: t.string,
});

export const PostLabsConnectionsConfigurationBodySchema = t.union([
  OAuthConfigSchema,
  ApiKeyConfigSchema,
]);

export function isApiKeyConfig(
  config: t.TypeOf<typeof PostLabsConnectionsConfigurationBodySchema>
): config is t.TypeOf<typeof ApiKeyConfigSchema> {
  return "apiKey" in config;
}

function getConnectionDetails(
  validatedBody: t.TypeOf<typeof PostLabsConnectionsConfigurationBodySchema>
) {
  if (isApiKeyConfig(validatedBody)) {
    return {
      credentialId: validatedBody.apiKey,
      connectionId: null,
    };
  }
  return {
    credentialId: null,
    connectionId: validatedBody.connectionId,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetLabsConnectionsConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to create connection configurations.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const configuration =
        await LabsConnectionsConfigurationResource.findByUserAndWorkspace({
          auth,
          userId: user.id,
        });
      res.status(200).json({
        configuration: configuration
          ? {
              id: configuration.id.toString(),
              credentialId: configuration.credentialId,
              dataSourceViewId: configuration.dataSourceViewId,
            }
          : null,
      });
      return;

    case "POST":
      let bodyToParse = req.body;

      if (typeof req.body === "string") {
        try {
          bodyToParse = JSON.parse(req.body);
        } catch (e) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid JSON in request body",
            },
          });
        }
      }

      const bodyValidation =
        PostLabsConnectionsConfigurationBodySchema.decode(bodyToParse);
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

      // Check if configuration already exists
      const existingConfiguration =
        await LabsConnectionsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider,
        });

      if (existingConfiguration) {
        return apiError(req, res, {
          status_code: 409,
          api_error: {
            type: "transcripts_configuration_already_exists",
            message: "A configuration for this provider already exists.",
          },
        });
      }

      let credentialId: string | null = null;
      const connectionId: string | null = null;

      if (isApiKeyConfig(validatedBody) && isCredentialProvider(provider)) {
        const oAuthRes = await oauthApi.postCredentials({
          provider,
          userId: user.sId,
          workspaceId: owner.sId,
          credentials: {
            api_key: validatedBody.apiKey,
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

      try {
        const configuration =
          await LabsConnectionsConfigurationResource.makeNew({
            name: `${provider} connection`,
            provider,
            userId: user.id,
            workspaceId: owner.id,
            credentialId,
            connectionId,
            dataSourceViewId: null,
            syncStatus: SyncStatus.IDLE,
          });

        res.status(200).json({
          configuration: {
            id: configuration.id.toString(),
            credentialId: configuration.credentialId,
            dataSourceViewId: configuration.dataSourceViewId,
          },
        });
        return;
      } catch (err) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create connection configuration.",
          },
        });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
