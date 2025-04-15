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
import {
  HubspotCredentialsSchema,
  isCredentialProvider,
  OAuthAPI,
  SyncStatus,
} from "@app/types";

type LabsConnectionConfiguration = {
  id: string;
  credentialId: string | null;
  dataSourceViewId: number | null;
};

export type GetLabsConnectionsConfigurationResponseBody =
  LabsConnectionConfiguration[];

export const acceptableConnectionProvidersCodec = t.literal("hubspot");

const OAuthConfigSchema = t.type({
  provider: acceptableConnectionProvidersCodec,
  connectionId: t.string,
});

const CredentialsConfigSchema = t.type({
  provider: acceptableConnectionProvidersCodec,
  credentials: HubspotCredentialsSchema,
});

export const PostLabsConnectionsConfigurationBodySchema = t.union([
  OAuthConfigSchema,
  CredentialsConfigSchema,
]);

export function isCredentialsConfig(
  config: t.TypeOf<typeof PostLabsConnectionsConfigurationBodySchema>
): config is t.TypeOf<typeof CredentialsConfigSchema> {
  return "credentials" in config;
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
      const configurations =
        await LabsConnectionsConfigurationResource.listByWorkspace({
          auth,
        });

      res.status(200).json(
        configurations.map((c) => ({
          id: c.id.toString(),
          credentialId: c.credentialId,
          dataSourceViewId: c.dataSourceViewId,
          provider: c.provider,
        }))
      );
      return;

    case "POST":
      const bodyValidation = PostLabsConnectionsConfigurationBodySchema.decode(
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
            type: "labs_connection_configuration_already_exists",
            message: "A configuration for this provider already exists.",
          },
        });
      }

      let credentialId: string | null = null;
      const connectionId: string | null = null;

      if (
        isCredentialsConfig(validatedBody) &&
        isCredentialProvider(provider)
      ) {
        const oAuthRes = await oauthApi.postCredentials({
          provider,
          userId: user.sId,
          workspaceId: owner.sId,
          credentials: validatedBody.credentials,
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

        res.status(200).json([
          {
            id: configuration.id.toString(),
            credentialId: configuration.credentialId,
            dataSourceViewId: configuration.dataSourceViewId,
          },
        ]);
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
