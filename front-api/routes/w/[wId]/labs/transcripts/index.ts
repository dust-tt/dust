import config from "@app/lib/api/config";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/lib/api/labs/transcripts";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import {
  isCredentialProvider,
  isProviderWithDefaultWorkspaceConfiguration,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import tId from "./[tId]";
import connector from "./connector";
import defaultRoute from "./default";
import {
  getConnectionDetails,
  isApiKeyConfig,
  PostLabsTranscriptsConfigurationBodySchema,
} from "./schemas";

// Mounted at /api/w/:wId/labs/transcripts.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetLabsTranscriptsConfigurationResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();

    const transcriptsConfigurationRes =
      await LabsTranscriptsConfigurationResource.findByUserAndWorkspace({
        auth,
        userId: user.id,
      });

    return ctx.json({
      configuration: transcriptsConfigurationRes?.toJSON() ?? null,
    });
  }
);

app.post(
  "/",
  validate("json", PostLabsTranscriptsConfigurationBodySchema),
  async (ctx): HandlerResult<GetLabsTranscriptsConfigurationResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const owner = auth.getNonNullableWorkspace();

    const body = ctx.req.valid("json");
    const { provider } = body;
    const { oAuthConnectionId, useConnectorConnection, apiKey } =
      getConnectionDetails(body);

    const transcriptsConfigurationAlreadyExists =
      await LabsTranscriptsConfigurationResource.findByUserAndWorkspace({
        auth,
        userId: user.id,
      });

    if (transcriptsConfigurationAlreadyExists) {
      return apiError(ctx, {
        status_code: 409,
        api_error: {
          type: "transcripts_configuration_already_exists",
          message: "The transcripts configuration already exists.",
        },
      });
    }

    let credentialId: string | undefined;

    if (isApiKeyConfig(body)) {
      if (!apiKey) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "API key is required",
          },
        });
      }

      if (isCredentialProvider(provider)) {
        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const oAuthRes = await oauthApi.postCredentials({
          provider,
          userId: user.sId,
          workspaceId: owner.sId,
          credentials: {
            api_key: apiKey,
          },
        });

        if (oAuthRes.isErr()) {
          return apiError(ctx, {
            status_code: 500,
            api_error: {
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
        await LabsTranscriptsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider,
          isDefaultWorkspaceConfiguration: true,
        });

      isDefaultWorkspaceConfiguration =
        currentDefaultConfiguration === null ||
        currentDefaultConfiguration === undefined;
    }

    const created = await LabsTranscriptsConfigurationResource.makeNew({
      userId: user.id,
      workspaceId: owner.id,
      provider,
      connectionId: oAuthConnectionId ?? null,
      credentialId: credentialId ?? null,
      isDefaultWorkspaceConfiguration,
      useConnectorConnection,
    });

    return ctx.json({ configuration: created.toJSON() ?? null });
  }
);

// Static sub-routes must be registered before the dynamic `/:tId`.
app.route("/connector", connector);
app.route("/default", defaultRoute);
app.route("/:tId", tId);

export default app;
